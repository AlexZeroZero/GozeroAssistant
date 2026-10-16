param(
    [ValidateRange(0,15)][int]$GpuIndex=0,
    [ValidateRange(15,60)][int]$ScanSeconds=25,
    [ValidateRange(30,120)][int]$ConfirmSeconds=45
)
$ErrorActionPreference='Stop'
$exe=Join-Path $PSScriptRoot 'GozeroMdsCore.exe'
if (!(Test-Path -LiteralPath $exe)) { throw 'GozeroMdsCore.exe must be beside this script.' }
$smi=(Get-Command nvidia-smi.exe -ErrorAction Stop).Source
$root=Join-Path $PSScriptRoot ('tuning-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,6))
New-Item -ItemType Directory -Path $root | Out-Null
$utf8=New-Object System.Text.UTF8Encoding($false)
$oldSettings=$env:GPU_OC_SETTINGS
$oldDuty=$env:GPU_MINE_DUTY
$results=New-Object System.Collections.Generic.List[object]
$active=$null
$iteration=0
function Temperature {
    $rows=@(& $smi --query-gpu=temperature.gpu --format=csv,noheader,nounits)
    if ($LASTEXITCODE -ne 0 -or !$rows.Count) {throw 'Cannot read GPU temperature; tuning stopped.'}
    $values=@($rows | ForEach-Object { [int]$_.Trim() })
    return ($values | Measure-Object -Maximum).Maximum
}
function Profile([string]$Name,[int]$Group=64,[int]$Batch=8192,[int]$Dispatch=1000,[int]$Verify=2) {
    return [pscustomobject]@{name=$Name;workgroup_size=$Group;batch_nonces=$Batch;responsive_iters=$Dispatch;iters_per_dispatch=[Math]::Max(2000,$Dispatch);verification_threads=$Verify}
}
function ConfigText($p) {
    return "workgroup_size=$($p.workgroup_size)`nbatch_nonces=$($p.batch_nonces)`niters_per_dispatch=$($p.iters_per_dispatch)`nresponsive_iters=$($p.responsive_iters)`nverification_threads=$($p.verification_threads)`n"
}
function Trial($p,[int]$seconds) {
    $script:iteration++
    $label=('{0:D2}-{1}' -f $script:iteration,$p.name)
    $cool=[Diagnostics.Stopwatch]::StartNew()
    while ((Temperature) -gt 65) {
        if ($cool.Elapsed.TotalSeconds -gt 180) { throw 'GPU did not cool to 65 C within 3 minutes; stop other GPU work and retry.' }
        Start-Sleep -Seconds 3
    }
    $config=Join-Path $root ($label+'.toml')
    [IO.File]::WriteAllText($config,(ConfigText $p),$utf8)
    $env:GPU_OC_SETTINGS=$config
    $env:GPU_MINE_DUTY=$null
    $stdout=Join-Path $root ($label+'.log')
    $stderr=Join-Path $root ($label+'-stderr.log')
    Write-Host ("Testing {0} ({1}s), GPU index {2}, 90% duty..." -f $label,$seconds,$GpuIndex)
    $watch=[Diagnostics.Stopwatch]::StartNew()
    $samples=New-Object System.Collections.Generic.List[object]
    $script:active=Start-Process -FilePath $exe -ArgumentList @('--backend','gpu','--gpu-index',"$GpuIndex",'--benchmark',"$seconds",'--benchmark-share-bits','6','--duty','0.9') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $null=$script:active.Handle
    try {
        while (!$script:active.HasExited) {
            $t=Temperature
            $samples.Add([pscustomobject]@{seconds=$watch.Elapsed.TotalSeconds;temperature=$t})
            if ($t -ge 85) { throw '85 C temperature limit reached; this test has been stopped.' }
            if ($watch.Elapsed.TotalSeconds -gt ($seconds+70)) {throw 'Kernel test timed out.'}
            Start-Sleep -Seconds 1
            $script:active.Refresh()
        }
        $script:active.WaitForExit()
        $exitCode=$script:active.ExitCode
    } catch {
        $failure=[pscustomobject]@{label=$label;profile=$p;error=$_.Exception.Message;samples=@($samples.ToArray());recommended=$false}
        [IO.File]::WriteAllText((Join-Path $root ($label+'-failure.json')),($failure | ConvertTo-Json -Depth 10),$utf8)
        throw
    } finally {
        if ($script:active -and !$script:active.HasExited) {$script:active.Kill();$script:active.WaitForExit()}
        $script:active=$null
    }
    $records=@(Get-Content -LiteralPath $stdout | Where-Object {$_ -like 'MDS {*'} | ForEach-Object { $_.Substring(4) | ConvertFrom-Json })
    $b=@($records | Where-Object {$_.type -eq 'benchmark'})
    $gpu=@($records | Where-Object {$_.type -eq 'selftest' -and $_.backend -eq 'gpu' -and $_.passed})
    if ($exitCode -ne 0 -or $b.Count -ne 1 -or $gpu.Count -ne 1) {throw "Kernel/self-test failed: $stdout"}
    $b=$b[0]
    if ($b.networkUsed -or $b.iterations -ne 1000000 -or $b.locallyVerifiedShares -lt 1 -or $b.gpuDiagnostics.completedBatchNonces -lt 1) {throw 'Invalid verification-inclusive benchmark result.'}
    $r=[pscustomobject]@{label=$label;profile=$p;benchmark=$b;device=$gpu[0].device;samples=@($samples.ToArray());completeRate=($b.gpuDiagnostics.completedBatchNonces/$b.seconds)}
    $results.Add($r)
    [IO.File]::WriteAllText((Join-Path $root ($label+'.json')),($r | ConvertTo-Json -Depth 12),$utf8)
    Write-Host ('Completed chains: {0:N1} N/s; locally verified shares: {1:N2}/s' -f $r.completeRate,$b.localSharesPerSecond)
    return $r
}
function Aggregate($runs) {
    $seconds=($runs | ForEach-Object {$_.benchmark.seconds} | Measure-Object -Sum).Sum
    return [pscustomobject]@{
        completeRate=(($runs | ForEach-Object {$_.benchmark.gpuDiagnostics.completedBatchNonces} | Measure-Object -Sum).Sum/$seconds)
        shareRate=(($runs | ForEach-Object {$_.benchmark.locallyVerifiedShares} | Measure-Object -Sum).Sum/$seconds)
    }
}
try {
    Write-Host 'MDS RTX local tuning: approximately 10-20 minutes. No network mining or pool income.'
    Write-Host 'Close other GPU workloads first. Ctrl+C stops the test. No clock, power or security settings are changed.'
    $hardware=@(& $smi --query-gpu=name,uuid,driver_version --format=csv,noheader)
    if ($LASTEXITCODE -ne 0) {throw 'Unable to identify NVIDIA hardware.'}
    $base=Profile 'reference'
    $profiles=@($base,(Profile 'wg32' 32),(Profile 'wg128' 128),(Profile 'wg256' 256),
        (Profile 'dispatch2000' 64 8192 2000),(Profile 'dispatch4000' 64 8192 4000),
        (Profile 'batch4096' 64 4096),(Profile 'batch16384' 64 16384),(Profile 'verify4' 64 8192 1000 4),
        (Profile 'combined8192' 64 8192 2000 4),(Profile 'combined16384' 64 16384 2000 4))
    $reference=Trial $base $ScanSeconds
    # Large Ada/Ampere/Blackwell cards get extra occupancy candidates; these
    # are measured alternatives, never assumed optimal model-specific presets.
    if ($reference.device -match 'RTX\s+(3090|4090|5090)') {
        $profiles+=@((Profile 'batch32768' 64 32768 2000 4),(Profile 'batch65536' 64 65536 2000 4))
    }
    $scan=@($reference)+@(foreach ($p in ($profiles | Select-Object -Skip 1)) {Trial $p $ScanSeconds})
    $best=$scan | Sort-Object completeRate -Descending | Select-Object -First 1
    $validation=@()
    $selected=$base
    $reason='No candidate met the repeat-test improvement criteria; keep conservative defaults.'
    if ($best.profile.name -ne 'reference') {
        # Alternating confirmation reduces order/heat bias. Require both real
        # completed work and local verified share throughput to improve.
        $validation=@((Trial $base $ConfirmSeconds),(Trial $best.profile $ConfirmSeconds),
            (Trial $best.profile $ConfirmSeconds),(Trial $base $ConfirmSeconds))
        $old=Aggregate @($validation[0],$validation[3])
        $new=Aggregate @($validation[1],$validation[2])
        if ($new.completeRate -gt $old.completeRate*1.05 -and $new.shareRate -gt $old.shareRate*1.05) {
            $selected=$best.profile
            $reason='Measured improvement >5% in completed work and verified share throughput in confirmation runs.'
        }
    }
    $recommended=Join-Path $root 'GPU_OC_SETTINGS.recommended.toml'
    [IO.File]::WriteAllText($recommended,(ConfigText $selected),$utf8)
    $report=[pscustomobject]@{hardware=$hardware;gpuIndex=$GpuIndex;coreSha256=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash;
        generatedAt=(Get-Date).ToString('o');duty=0.9;shareTargetBits=6;networkUsed=$false;selected=$selected;reason=$reason;
        scan=$scan;confirmation=$validation;warning='Best tested profile on this hardware/driver, not a guaranteed global optimum or pool payout rate.'}
    [IO.File]::WriteAllText((Join-Path $root 'RESULT.json'),($report | ConvertTo-Json -Depth 14),$utf8)
    Write-Host $reason
    Write-Host "Recommended settings: $recommended"
    Write-Host 'To apply, copy that file to GPU_OC_SETTINGS.toml beside the core, then restart it.'
    Write-Host 'Existing settings were not overwritten. Retune after changing GPU, driver, CPU workload or duty.'
} finally {
    if ($active -and !$active.HasExited) {$active.Kill();$active.WaitForExit()}
    $env:GPU_OC_SETTINGS=$oldSettings
    $env:GPU_MINE_DUTY=$oldDuty
}
