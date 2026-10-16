param([string]$RustBin='',[string]$GccBin='',[string]$TargetDirectory='',[switch]$GpuTests,[switch]$CudaTests)
$ErrorActionPreference='Stop'
if ($RustBin) {$env:PATH=$RustBin+';'+$env:PATH}
if ($GccBin) {$env:PATH=$GccBin+';'+$env:PATH}
if ($TargetDirectory) {$env:CARGO_TARGET_DIR=$TargetDirectory}
# GNU tools on Windows require an ASCII target directory.
Push-Location $PSScriptRoot
try {
 & cargo build --release --locked
 if ($LASTEXITCODE -ne 0) {throw 'MDS build failed'}
 & cargo test --release --locked --bin GozeroMdsCore
 if ($LASTEXITCODE -ne 0) {throw 'MDS protocol tests failed'}
 & cargo test --release --locked --test consensus
 if ($LASTEXITCODE -ne 0) {throw 'MDS full-chain consensus test failed'}
 if ($GpuTests) {
  & cargo test --release --locked --test gpu -- --ignored --test-threads=1
  if ($LASTEXITCODE -ne 0) {throw 'MDS GPU full-chain/candidate test failed'}
 }
 if ($CudaTests) {
  & cargo test --release --locked --test cuda -- --ignored --test-threads=1
  if ($LASTEXITCODE -ne 0) {throw 'MDS CUDA consensus/stream cancellation test failed'}
 }
} finally {Pop-Location}
