@echo off
cd /d "%~dp0"
echo MDS local GPU tuning. No pool connection. About 10-20 minutes.
echo Close other GPU workloads first. Press Ctrl+C to stop.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0TUNE-RTX.ps1"
pause
