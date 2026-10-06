#!/bin/zsh
# Runs from Finder or SSH. The source bundle contains no prebuilt Mac miner.
set -u
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo '需要 Python 3。请先安装 Xcode / Command Line Tools，再重试。'
  exit 1
fi
if [[ -f "desktop/macos/run_checks.py" ]]; then
  RUNNER="desktop/macos/run_checks.py"
else
  RUNNER="run_checks.py"
fi
python3 "$RUNNER" "$@"
RESULT=$?
if [[ -t 0 && -z "${SSH_CONNECTION:-}" ]]; then
  read '?测试结束，按回车关闭窗口。'
fi
exit "$RESULT"
