param(
    [string]$RustBin = '',
    [string]$GccBin = '',
    [string]$TargetDirectory = ''
)
$ErrorActionPreference = 'Stop'
if ($RustBin) { $env:PATH = $RustBin + ';' + $env:PATH }
if ($GccBin) { $env:PATH = $GccBin + ';' + $env:PATH }
if ($TargetDirectory) { $env:CARGO_TARGET_DIR = $TargetDirectory }
# Standard x86_64 Windows GNU build with runtime SIMD dispatch. No AVX2-only EXE.
& cargo build --release --locked --manifest-path (Join-Path $PSScriptRoot 'Cargo.toml')
if ($LASTEXITCODE -ne 0) { throw 'Blocknet core build failed' }
& cargo test --release --locked --manifest-path (Join-Path $PSScriptRoot 'Cargo.toml') -- --test-threads=1
if ($LASTEXITCODE -ne 0) { throw 'Blocknet core tests failed' }
