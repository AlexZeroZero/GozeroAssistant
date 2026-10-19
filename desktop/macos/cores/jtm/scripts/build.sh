#!/bin/bash
# Release build + release gate for towerminer: the Linux binary and the
# Windows executable, built in Docker, checked, packaged in dist/.
#
#   scripts/build.sh
#
# Needs docker and a rustup toolchain on the host (stable, with the
# x86_64-pc-windows-gnu target: `rustup target add x86_64-pc-windows-gnu`),
# mounted read-only into the build container.
#
# Environment:
#   DOCKER            docker command (default "docker"; e.g. "sudo -n docker")
#   RUSTUP_HOME       host rustup directory (default ~/.rustup)
#   TM_CPUS           CPUs given to each container (default 8)
#   TM_JOBS           cargo build jobs (default 8)
#   TM_GATE_RANDOM    random seeds of --gate on top of the 256 golden (default 300)
#   TM_NONCE_SECS     seconds of --check-nonces (default 20)
#   TM_TARGET         cargo target directory (default target/docker)
#   TM_CARGO_HOME     cargo home: registry cache (default target/cargo-home)
#   WINE              wine binary: when set, the Windows executable also runs
#                     --version, --gate and --check-nonces under it
#   SOURCE_DATE_EPOCH timestamp of the archive entries (default: last commit)
#
# Refuses: vendor/ differing from VENDOR.sha256, a mutant or thermal-guard
# build, a failing unit test, a gate or nonce check failing on Ubuntu 22.04 or
# 24.04, a Linux binary that needs glibc newer than 2.35, a build path left
# in a binary.
set -euo pipefail
export LC_ALL=C
cd "$(dirname "$0")/.."
ROOT=$PWD
VERSION=$(sed -n 's/^version = "\(.*\)"$/\1/p' towerminer/Cargo.toml | head -1)
DOCKER=${DOCKER:-docker}
RUSTUP_HOME=${RUSTUP_HOME:-$HOME/.rustup}
CPUS=${TM_CPUS:-8}
JOBS=${TM_JOBS:-8}
NRAND=${TM_GATE_RANDOM:-300}
NSECS=${TM_NONCE_SECS:-20}
IMAGE=towerminer-build:jammy
TARGET=${TM_TARGET:-$ROOT/target/docker}
CARGO_CACHE=${TM_CARGO_HOME:-$ROOT/target/cargo-home}
DIST=$ROOT/dist
WIN=x86_64-pc-windows-gnu
LNAME=towerminer-$VERSION-linux-x86_64
WNAME=towerminer-$VERSION-windows-x86_64
if [ -z "${SOURCE_DATE_EPOCH:-}" ]; then
    SOURCE_DATE_EPOCH=$(git log -1 --format=%ct 2>/dev/null || date +%s)
fi
fail() { echo "FATAL: $*" >&2; exit 1; }

TOOLCHAIN=$(ls "$RUSTUP_HOME/toolchains" 2>/dev/null | grep -m1 '^stable-x86_64-unknown-linux-gnu$' || true)
[ -n "$TOOLCHAIN" ] || fail "no stable-x86_64-unknown-linux-gnu toolchain under $RUSTUP_HOME"
[ -d "$RUSTUP_HOME/toolchains/$TOOLCHAIN/lib/rustlib/$WIN" ] || fail "rustup target $WIN missing (rustup target add $WIN)"
(cd vendor && sha256sum -c --quiet ../VENDOR.sha256) || fail "vendor/ differs from VENDOR.sha256"
mkdir -p "$TARGET" "$CARGO_CACHE" "$DIST"

echo "== build image"
$DOCKER build -q -t "$IMAGE" -f scripts/Dockerfile.build scripts >/dev/null

# Build paths never reach the binaries: sources, registry and toolchain are
# remapped to relative names.
REMAP="--remap-path-prefix=/src=towerminer --remap-path-prefix=/cargo=cargo --remap-path-prefix=/rustup=rustup"
incontainer() {
    $DOCKER run --rm --cpus "$CPUS" --network host -u "$(id -u):$(id -g)" \
        -e HOME=/tmp -e RUSTUP_HOME=/rustup -e RUSTUP_TOOLCHAIN=stable -e CARGO_HOME=/cargo \
        -e CARGO_TARGET_DIR=/target -e CARGO_BUILD_JOBS="$JOBS" -e RUSTFLAGS="$REMAP" \
        -e PATH="/rustup/toolchains/$TOOLCHAIN/bin:/usr/local/bin:/usr/bin:/bin" \
        -v "$RUSTUP_HOME":/rustup:ro -v "$CARGO_CACHE":/cargo -v "$ROOT":/src:ro -v "$TARGET":/target \
        -v "$DIST":/dist -w /src "$IMAGE" bash -c "$1"
}

echo "== build (Linux, Ubuntu 22.04) + Windows (MinGW-w64)"
incontainer "cargo build --release --locked -p towerminer && cargo build --release --locked -p towerminer --target $WIN"
BIN=$TARGET/release/towerminer
EXE=$TARGET/$WIN/release/towerminer.exe
VER=$(incontainer "/target/release/towerminer --version")
case "$VER" in
    *mutant* | *fleet*) fail "$VER is not a public release build" ;;
    "towerminer $VERSION") ;;
    *) fail "unexpected --version: $VER" ;;
esac

echo "== glibc floor and build paths"
GLIBC=$(incontainer "objdump -T /target/release/towerminer" | grep -oE 'GLIBC_[0-9]+(\.[0-9]+)+' | sort -Vu | tail -1)
[ "$(printf '%s\nGLIBC_2.35\n' "$GLIBC" | sort -V | tail -1)" = GLIBC_2.35 ] || fail "the binary needs $GLIBC (> 2.35)"
for f in release/towerminer $WIN/release/towerminer.exe; do
    # Absolute paths of the host and of the container (/src/towerminer/src =
    # our crate unremapped). A remapped "cargo/registry/..." can follow a "/"
    # literal in .rdata and read "/cargo/..." in strings(1): not a leak.
    LEAK=$(incontainer "strings -a /target/$f" | grep -E "(/home/|/root/|/tmp/|/target/|/rustup/|/src/towerminer/src/|$ROOT)" | head -3 || true)
    [ -z "$LEAK" ] || fail "build path left in $f: $LEAK"
done
incontainer "file /target/$WIN/release/towerminer.exe" | grep -q 'PE32+ executable (console) x86-64' \
    || fail "towerminer.exe is not a 64-bit Windows console executable"

echo "== unit tests (workspace)"
TESTS=$(incontainer "cargo test --release --locked 2>&1" | grep -E '^test result' || true)
echo "$TESTS"
[ -n "$TESTS" ] && ! echo "$TESTS" | grep -qv ' 0 failed' || fail "unit tests"
TESTS_TM=$(echo "$TESTS" | awk '{n+=$4; f+=$6} END {print n " passed, " f " failed"}')

echo "== release gate on Ubuntu 22.04 and 24.04"
GATES=""
for img in ubuntu:22.04 ubuntu:24.04; do
    OUT=$($DOCKER run --rm --cpus "$CPUS" -v "$BIN":/towerminer:ro "$img" bash -c \
        "/towerminer --gate --gate-random $NRAND 2>&1 | grep -E '^(oracle|GATE)'; \
         /towerminer --no-tune-file --check-nonces $NSECS 2>/dev/null | grep CHECK-NONCES; \
         /towerminer --no-tune-file --policy efficiency --check-nonces 5 2>/dev/null | grep CHECK-NONCES; \
         ldd --version | head -1") || true
    echo "$img:"; echo "$OUT" | sed 's/^/  /'
    echo "$OUT" | grep -q '^GATE PASS$' || fail "gate on $img"
    [ "$(echo "$OUT" | grep -c 'CHECK-NONCES.* bad=0 dup=0 outside_region=0')" = 2 ] || fail "check-nonces on $img"
    GATES+="$img: $(echo "$OUT" | tr '\n' ' ')"$'\n'
done

WINE_RES="not run (set WINE=... to run the Windows executable under wine)"
if [ -n "${WINE:-}" ]; then
    echo "== Windows executable under $WINE"
    W=$(WINEDEBUG=-all "$WINE" "$EXE" --version 2>/dev/null | tr -d '\r')
    G=$(WINEDEBUG=-all "$WINE" "$EXE" --gate --gate-random "$NRAND" 2>&1 | tr -d '\r' | grep -E '^GATE')
    N=$(WINEDEBUG=-all "$WINE" "$EXE" --no-tune-file --check-nonces 5 2>/dev/null | tr -d '\r' | grep CHECK-NONCES)
    echo "$W / $G / $N"
    [ "$G" = "GATE PASS" ] && echo "$N" | grep -q ' bad=0 dup=0 outside_region=0' || fail "Windows executable under wine"
    WINE_RES="$W; $G; $N"
fi

echo "== package"
rm -f "$DIST/$LNAME.tar.gz" "$DIST/$WNAME.zip" "$DIST/SHA256SUMS"
incontainer "set -e; S=\$(mktemp -d); mkdir \$S/$LNAME \$S/win
    cp /target/release/towerminer README.md LICENSE \$S/$LNAME/
    cp /target/$WIN/release/towerminer.exe README.md LICENSE \$S/win/
    touch -d @$SOURCE_DATE_EPOCH \$S/$LNAME \$S/$LNAME/* \$S/win/*
    tar --sort=name --mtime=@$SOURCE_DATE_EPOCH --owner=0 --group=0 --numeric-owner -C \$S -cf - $LNAME | gzip -9n > /dist/$LNAME.tar.gz
    (cd \$S/win && zip -X -9 -q /dist/$WNAME.zip towerminer.exe README.md LICENSE)
    cd /dist && sha256sum $LNAME.tar.gz $WNAME.zip > SHA256SUMS"

cat > "$DIST/RELEASE.txt" <<EOT
towerminer $VERSION
linux    $LNAME.tar.gz: towerminer sha256 $(sha256sum "$BIN" | cut -d' ' -f1)
windows  $WNAME.zip: towerminer.exe sha256 $(sha256sum "$EXE" | cut -d' ' -f1)
glibc    $GLIBC (highest versioned symbol the Linux binary needs; it runs on this glibc or newer)
rustc    $(incontainer "rustc --version")
built    $(date -u +%FT%TZ) in $IMAGE (Ubuntu 22.04, MinGW-w64 $(incontainer "x86_64-w64-mingw32-gcc -dumpversion"))
tests    $TESTS_TM (cargo test --release, whole workspace)
gate     --gate --gate-random $NRAND (256 golden + $NRAND random, every kernel shape, pipe chain); --check-nonces $NSECS (hashrate) + 5 (efficiency)
$GATES
wine     $WINE_RES
EOT
cat "$DIST/RELEASE.txt"
echo "== dist/"
(cd "$DIST" && ls -l && cat SHA256SUMS)
