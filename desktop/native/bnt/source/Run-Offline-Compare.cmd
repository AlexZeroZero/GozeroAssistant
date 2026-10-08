@echo off
setlocal
cd /d "%~dp0"
echo Gozero Blocknet Core - bounded OFFLINE test, one CPU worker, about 2 GiB RAM.
echo No pool connection. No wallet needed. Each engine stops after 10 hashes.
GozeroBlocknetCore.exe --version
if errorlevel 1 goto failed
GozeroBlocknetCore.exe bench official 1 10 > official-result.json
if errorlevel 1 goto failed
GozeroBlocknetCore.exe bench prefetch 1 10 > optimized-result.json
if errorlevel 1 goto failed
type official-result.json
type optimized-result.json
echo Completed. Detailed measurements saved in the two JSON files.
pause
exit /b 0
:failed
echo Test failed. Check the error above; close other memory-heavy tasks if needed.
pause
exit /b 1

