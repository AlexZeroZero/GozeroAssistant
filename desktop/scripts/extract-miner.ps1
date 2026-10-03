param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$base=[System.IO.Path]::GetFullPath($Destination)+[System.IO.Path]::DirectorySeparatorChar
[System.IO.Directory]::CreateDirectory($base) | Out-Null
$zip=[System.IO.Compression.ZipFile]::OpenRead($Archive)
try {
    if ($zip.Entries.Count -gt 30) { throw 'Unexpected archive contents' }
    foreach($entry in $zip.Entries) {
        if($entry.FullName -ne 'krig-miner.exe') { continue }
        if($entry.Length -gt 600MB) { throw 'Unexpected executable size' }
        $target=[System.IO.Path]::GetFullPath([System.IO.Path]::Combine($base,$entry.FullName))
        if(-not $target.StartsWith($base,[System.StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid archive path' }
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$true)
    }
} finally { $zip.Dispose() }
if(-not (Test-Path -LiteralPath ([System.IO.Path]::Combine($base,'krig-miner.exe')))) { throw 'Miner executable missing' }
