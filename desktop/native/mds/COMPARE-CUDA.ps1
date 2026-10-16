param(
    [string]$Baseline='',
    [ValidateRange(0,15)][int]$GpuIndex=0,
    [ValidateRange(5,60)][int]$Seconds=30,
    [ValidateRange(0.1,0.9)][double]$Duty=0.9
)
$ErrorActionPreference='Stop'
$exe=Join-Path $PSScriptRoot 'GozeroMdsCore.exe'
if (!(Test-Path -LiteralPath $exe)) {throw 'Place this script beside the new GozeroMdsCore.exe.'}
if (!$Baseline) {
    Add-Type -AssemblyName System.Windows.Forms
    $picker=New-Object System.Windows.Forms.OpenFileDialog
    $picker.Title='Select OLD 1.0.47 resources/app/native/mds/GozeroMdsCore.exe'
    $picker.Filter='MDS core (GozeroMdsCore.exe)|GozeroMdsCore.exe'
    if ($picker.ShowDialog() -ne 'OK') {return}
    $Baseline=$picker.FileName
    $picker.Dispose()
}
if ((Get-FileHash -LiteralPath $Baseline -Algorithm SHA256).Hash.ToLowerInvariant() -ne '0365d55b91b5cd8bccc2737de31a77ed6c89332eea3c6640933ff8f1a07a293c') {throw 'Baseline is not the released 0.1.10 core from assistant 1.0.47.'}
$smi=(Get-Command nvidia-smi.exe -ErrorAction Stop).Source
$out=Join-Path $PSScriptRoot ('comparison-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,6))
New-Item -ItemType Directory -Path $out | Out-Null
$active=$null;$rows=@();$samples=@();$complete=$false
function Sample {
    $raw=@(& $smi --query-gpu=index,uuid,name,temperature.gpu,power.draw,utilization.gpu,clocks.current.graphics --format=csv,noheader,nounits)
    if ($LASTEXITCODE -ne 0 -or !$raw.Count) {throw 'GPU telemetry unavailable; comparison stopped.'}
    $highest=0
    foreach ($line in $raw) {$parts=$line.Split(',');$highest=[Math]::Max($highest,[int]$parts[3].Trim())}
    return @{temperature=$highest;raw=$raw;at=(Get-Date).ToString('o')}
}
try {
    $iteration=0
    foreach ($mode in @('old','new','new','old')) {
        $iteration++
        $cool=[Diagnostics.Stopwatch]::StartNew()
        while ((Sample).temperature -gt 64) {
            if ($cool.Elapsed.TotalSeconds -gt 240) {throw 'Cooldown to 64 C timed out.'}
            Start-Sleep -Seconds 2
        }
        $program=if ($mode -eq 'old') {$Baseline} else {$exe}
        $log=Join-Path $out "$iteration-$mode.log";$err=Join-Path $out "$iteration-$mode-stderr.log"
        $argsList=@('--backend','cuda','--gpu-index',"$GpuIndex",'--benchmark',"$Seconds",'--benchmark-share-bits','12','--duty',$Duty.ToString([Globalization.CultureInfo]::InvariantCulture))
        Write-Host "$iteration/4 $mode core: offline, $Seconds seconds, budget $Duty. Stop other miners first."
        $watch=[Diagnostics.Stopwatch]::StartNew()
        $active=Start-Process -FilePath $program -ArgumentList $argsList -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $log -RedirectStandardError $err
        $null=$active.Handle
        while (!$active.HasExited) {
            $s=Sample;$samples+=@{run=$iteration;data=$s}
            if ($s.temperature -ge 85) {throw '85 C protection: comparison incomplete.'}
            if ($watch.Elapsed.TotalSeconds -gt ($Seconds+100)) {throw 'Benchmark timed out.'}
            Start-Sleep -Seconds 1;$active.Refresh()
        }
        $active.WaitForExit()
        if ($active.ExitCode -ne 0) {throw "Core failed; read $log"}
        $records=@(Get-Content -LiteralPath $log | Where-Object {$_ -like 'MDS {*'} | ForEach-Object {$_.Substring(4)|ConvertFrom-Json})
        $b=@($records|Where-Object {$_.type -eq 'benchmark'})
        if ($b.Count -ne 1 -or $b[0].iterations -ne 1000000 -or $b[0].networkUsed -or $b[0].gpuDiagnostics.completedBatchNonces -lt 1) {throw 'Missing full-chain result.'}
        $rows+=@{mode=$mode;sha256=(Get-FileHash -LiteralPath $program -Algorithm SHA256).Hash;result=$b[0]}
        Write-Host ('{0}: {1:N1} N/s; batch {2}; full completed work {3:N1} N/s' -f $mode,$b[0].noncesPerSecond,$b[0].gpuDiagnostics.batchNonces,($b[0].gpuDiagnostics.completedBatchNonces/$b[0].seconds))
        $active=$null
    }
    $old=($rows|Where-Object {$_.mode -eq 'old'}|ForEach-Object {$_.result.noncesPerSecond}|Measure-Object -Average).Average
    $new=($rows|Where-Object {$_.mode -eq 'new'}|ForEach-Object {$_.result.noncesPerSecond}|Measure-Object -Average).Average
    $complete=$true
    Write-Host ('Old mean {0:N1}; new mean {1:N1} N/s; change {2:N2}%. This is local throughput, not pool income.' -f $old,$new,(100*($new/$old-1)))
} finally {
    if ($active -and !$active.HasExited) {$active.Kill();$active.WaitForExit()}
    @{complete=$complete;rows=$rows;samples=$samples}|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $out 'RESULT.json') -Encoding UTF8
    Write-Host "Results: $out"
}
