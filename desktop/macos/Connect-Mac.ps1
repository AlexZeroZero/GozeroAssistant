# Run interactively in Windows PowerShell. No password is saved by this script.
param([string]$Destination = '')
$ErrorActionPreference = 'Stop'
$macRepo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$macKey = Join-Path $macRepo '.local/mac-ssh/client_ed25519'
$macKnownHosts = Join-Path $macRepo '.local/mac-ssh/known_hosts'
$macConnectionFile = Join-Path $macRepo '.local/mac-ssh/connection.json'
$macConnection = if (Test-Path -LiteralPath $macConnectionFile) { Get-Content -LiteralPath $macConnectionFile -Raw | ConvertFrom-Json } else { $null }
$macDestination = if ($Destination) { $Destination } else { $macConnection.destination }
if ($macDestination -notmatch '^[a-zA-Z0-9_-]+@[a-zA-Z0-9.-]+$') { throw 'Supply -Destination user@host or prepare the ignored project-local connection.json.' }
if (-not (Test-Path -LiteralPath $macKey) -or -not (Test-Path -LiteralPath ($macKey + '.pub'))) {
    throw 'Dedicated project SSH key is missing. Ask the development assistant to prepare it; do not overwrite existing keys.'
}
$macPublicKey = (Get-Content -LiteralPath ($macKey + '.pub') -Raw).Trim()
if ($macPublicKey -notmatch '^ssh-ed25519 [A-Za-z0-9+/=]+ gozero-mac-lan$') {
    throw 'Unexpected public key format.'
}
Write-Host "Connecting to $macDestination."
Write-Host 'First verify the host fingerprint on your Mac with:'
Write-Host '  ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub'
if ($macConnection -and $macDestination -eq $macConnection.destination -and $macConnection.hostFingerprint) {
    Write-Host 'The previously observed network fingerprint is:'
    Write-Host ('  ' + $macConnection.hostFingerprint)
}
Write-Host 'Accept the SSH prompt only if it matches your Mac. Enter your Mac password locally when asked.'
Write-Host 'The public key is appended once; existing authorized keys are preserved.'
$macOptions = @('-i', $macKey, '-o', "UserKnownHostsFile=$macKnownHosts", '-o', 'HostKeyAlgorithms=ssh-ed25519', '-o', 'ConnectTimeout=10')
$macInstall = "umask 077; mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && (grep -qxF '$macPublicKey' ~/.ssh/authorized_keys || printf '%s\n' '$macPublicKey' >> ~/.ssh/authorized_keys) && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys && uname -m"
& ssh @macOptions -o StrictHostKeyChecking=ask $macDestination $macInstall
if ($LASTEXITCODE -ne 0) { throw 'Initial SSH authorization failed. No remote build has been started.' }
& ssh @macOptions -o BatchMode=yes -o StrictHostKeyChecking=yes $macDestination 'uname -m'
if ($LASTEXITCODE -ne 0) { throw 'Public-key login check failed. Keep this terminal output for diagnosis.' }
Write-Host 'READY: dedicated SSH key login verified. Tell the development assistant to continue.' -ForegroundColor Green
