param(
    [ValidateRange(0,15)][int]$GpuIndex=0,
    [ValidateRange(5,60)][int]$Seconds=10,
    [ValidateRange(0.1,1.0)][double]$Duty=0.9,
    [ValidateSet('cuda','gpu','compare')][string]$Backend='cuda'
)
$ErrorActionPreference='Stop'
$exe=Join-Path $PSScriptRoot 'GozeroMdsCore.exe'
if (!(Test-Path -LiteralPath $exe)) {throw 'Place this script beside GozeroMdsCore.exe.'}
$smi=(Get-Command nvidia-smi.exe -ErrorAction Stop).Source
$output=Join-Path $PSScriptRoot ('cuda-test-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,6))
New-Item -ItemType Directory -Path $output | Out-Null
$oldDuty=$env:GPU_MINE_DUTY
$oldSettings=$env:GPU_OC_SETTINGS
$env:GPU_MINE_DUTY=$null
$env:GPU_OC_SETTINGS=Join-Path $output 'reference.toml'
[IO.File]::WriteAllText($env:GPU_OC_SETTINGS,"workgroup_size=64`nbatch_nonces=8192`niters_per_dispatch=2000`nresponsive_iters=1000`n",(New-Object System.Text.UTF8Encoding($false)))
$active=$null
function Temperature {
    $rows=@(& $smi --query-gpu=temperature.gpu --format=csv,noheader,nounits)
    if ($LASTEXITCODE -ne 0 -or !$rows.Count) {throw 'Cannot read GPU temperatures; stopped.'}
    return (@($rows | ForEach-Object {[int]$_.Trim()}) | Measure-Object -Maximum).Maximum
}
$order=if ($Backend -eq 'compare') {@('gpu','cuda','cuda','gpu')} else {@($Backend)}
$iteration=0
try {
    foreach ($mode in $order) {
        $iteration++
        $cool=[Diagnostics.Stopwatch]::StartNew()
        while ((Temperature) -gt 64) {
            if ($cool.Elapsed.TotalSeconds -gt 240) {throw 'GPU did not cool to 64 C in four minutes.'}
            Start-Sleep -Seconds 3
        }
        $log=Join-Path $output ("$iteration-$mode.log")
        $err=Join-Path $output ("$iteration-$mode-stderr.log")
        $watch=[Diagnostics.Stopwatch]::StartNew()
        $dutyText=$Duty.ToString([Globalization.CultureInfo]::InvariantCulture)
        Write-Host "Testing $mode for $Seconds seconds, duty $dutyText. No pool connection."
        $active=Start-Process -FilePath $exe -ArgumentList @('--backend',$mode,'--gpu-index',"$GpuIndex",'--benchmark',"$Seconds",'--benchmark-share-bits','12','--duty',$dutyText) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $log -RedirectStandardError $err
        $null=$active.Handle
        while (!$active.HasExited) {
            if ((Temperature) -ge 85) {throw '85 C reached. This run has stopped; do not treat a partial log as a completed benchmark.'}
            if ($watch.Elapsed.TotalSeconds -gt ($Seconds+100)) {throw 'Benchmark timed out.'}
            Start-Sleep -Seconds 1
            $active.Refresh()
        }
        $active.WaitForExit()
        if ($active.ExitCode -ne 0) {throw "Kernel failed. See $log and $err"}
        $records=@(Get-Content -LiteralPath $log | Where-Object {$_ -like 'MDS {*'} | ForEach-Object {$_.Substring(4) | ConvertFrom-Json})
        $b=@($records | Where-Object {$_.type -eq 'benchmark'})
        if ($b.Count -ne 1 -or $b[0].networkUsed -or $b[0].iterations -ne 1000000 -or $b[0].gpuDiagnostics.completedBatchNonces -lt 1) {throw 'Missing completed, full-chain benchmark result.'}
        Write-Host ('{0}: {1:N1} N/s; completed batch work {2:N1} N/s; CPU-verified shares {3} (not pool income).' -f $mode,$b[0].noncesPerSecond,($b[0].gpuDiagnostics.completedBatchNonces/$b[0].seconds),$b[0].locallyVerifiedShares)
        $active=$null
    }
} finally {
    if ($active -and !$active.HasExited) {$active.Kill();$active.WaitForExit()}
    $env:GPU_MINE_DUTY=$oldDuty
    $env:GPU_OC_SETTINGS=$oldSettings
    Write-Host "Logs saved in $output"
}
