@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0."

set "OUT_DIR=adb"
set "EXE_NAME=adb.exe"
set "ZIP_URL=https://dl.google.com/android/repository/platform-tools-latest-windows.zip"

echo [UpdatePlatformTools] Download latest Android SDK Platform-Tools (Windows)
echo [UpdatePlatformTools] Source: https://developer.android.com/tools/releases/platform-tools
echo [UpdatePlatformTools] Target: %CD%\%OUT_DIR%\

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%" 2>nul

where powershell >nul 2>&1
if errorlevel 1 (
  echo [UpdatePlatformTools] FAIL: PowerShell is required
  goto :end_fail
)

set "PS1=%TEMP%\UpdatePlatformTools.ps1"
> "%PS1%" echo $ErrorActionPreference = 'Stop'
>> "%PS1%" echo $out = Join-Path (Get-Location) 'adb'
>> "%PS1%" echo $url = 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip'
>> "%PS1%" echo $zip = Join-Path $env:TEMP 'platform-tools-latest-windows.zip'
>> "%PS1%" echo $extract = Join-Path $env:TEMP 'platform-tools-extract'
>> "%PS1%" echo $hdr = @{ 'User-Agent' = 'bm-google-photos-quota-reclaim' }
>> "%PS1%" echo if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out ^| Out-Null }
>> "%PS1%" echo Write-Host '[UpdatePlatformTools] downloading...'
>> "%PS1%" echo Invoke-WebRequest -Headers $hdr -Uri $url -OutFile $zip
>> "%PS1%" echo if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
>> "%PS1%" echo Write-Host '[UpdatePlatformTools] extracting...'
>> "%PS1%" echo Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
>> "%PS1%" echo $src = Join-Path $extract 'platform-tools'
>> "%PS1%" echo $adb = Join-Path $src 'adb.exe'
>> "%PS1%" echo if (-not (Test-Path $adb)) { throw 'adb.exe not found in platform-tools zip' }
>> "%PS1%" echo Get-ChildItem -LiteralPath $src ^| ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $out $_.Name) -Recurse -Force }
>> "%PS1%" echo $rev = 'unknown'
>> "%PS1%" echo $sp = Join-Path $src 'source.properties'
>> "%PS1%" echo if (Test-Path $sp) { $m = Select-String -LiteralPath $sp -Pattern 'Pkg\.Revision=(.+)' ^| Select-Object -First 1; if ($m) { $rev = $m.Matches[0].Groups[1].Value.Trim() } }
>> "%PS1%" echo Set-Content -LiteralPath (Join-Path $out 'version.txt') -Value $rev -Encoding ASCII
>> "%PS1%" echo Remove-Item $zip -Force -ErrorAction SilentlyContinue
>> "%PS1%" echo Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
>> "%PS1%" echo Write-Host ('[UpdatePlatformTools] saved ' + (Join-Path $out 'adb.exe'))

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "ERR=%ERRORLEVEL%"
del /f /q "%PS1%" 2>nul
if not "%ERR%"=="0" (
  echo [UpdatePlatformTools] FAIL: download
  goto :end_fail
)

if not exist "%OUT_DIR%\%EXE_NAME%" (
  echo [UpdatePlatformTools] FAIL: missing %OUT_DIR%\%EXE_NAME%
  goto :end_fail
)

echo [UpdatePlatformTools] OK: %CD%\%OUT_DIR%\%EXE_NAME%
if exist "%OUT_DIR%\version.txt" (
  set /p ADB_VER=<"%OUT_DIR%\version.txt"
  echo [UpdatePlatformTools] version !ADB_VER!
)
goto :end_ok

:end_fail
if /i "%~1"=="nopause" exit /b 1
echo.
pause
exit /b 1

:end_ok
if /i "%~1"=="nopause" exit /b 0
echo.
pause
exit /b 0
