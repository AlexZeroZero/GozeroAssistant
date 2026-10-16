#!/bin/sh
set -eu
cd "$(dirname "$0")"
test "$(uname -s)" = Darwin
test "$(uname -m)" = arm64
export MACOSX_DEPLOYMENT_TARGET=13.5
export WGPU_BACKEND=metal
cargo build --release --locked
cargo test --release --locked --bin GozeroMdsCore
cargo test --release --locked --test consensus
cargo test --release --locked --test gpu -- --ignored --test-threads=1
./target/release/GozeroMdsCore --backend gpu --self-test
