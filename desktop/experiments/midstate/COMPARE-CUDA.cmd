@echo off
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -File "%~dp0COMPARE-CUDA.ps1"
pause
