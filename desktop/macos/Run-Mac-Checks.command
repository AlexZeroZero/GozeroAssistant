#!/bin/zsh
# Runs from Finder or SSH. The source bundle contains no prebuilt Mac miner.
set -u
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1
PYTHON_BIN="${GOZERO_PYTHON:-}"
if [[ -z "$PYTHON_BIN" && -x "$SCRIPT_DIR/../python/bin/python3" ]]; then
  PYTHON_BIN="$SCRIPT_DIR/../python/bin/python3"
fi
if [[ -z "$PYTHON_BIN" ]]; then
  PYTHON_BIN="$(command -v python3 2>/dev/null || true)"
fi
if [[ -z "$PYTHON_BIN" || ! -x "$PYTHON_BIN" ]]; then
  echo '需要 Python 3。请先安装 Xcode / Command Line Tools，再重试。'
  exit 1
fi
if [[ -f "desktop/macos/run_checks.py" ]]; then
  RUNNER="desktop/macos/run_checks.py"
else
  RUNNER="run_checks.py"
fi
"$PYTHON_BIN" "$RUNNER" "$@"
RESULT=$?
if [[ -t 0 && -z "${SSH_CONNECTION:-}" ]]; then
  read '?测试结束，按回车关闭窗口。'
fi
exit "$RESULT"
