@echo off
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -File "%~dp0TEST-CUDA.ps1"
pause
