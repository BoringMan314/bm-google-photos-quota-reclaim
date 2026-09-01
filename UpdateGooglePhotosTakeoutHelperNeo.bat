@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0."

set "OUT_DIR=GooglePhotosTakeoutHelperNeo"
set "EXE_NAME=gpth.exe"
set "ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "ARCH=arm64"

echo [UpdateGooglePhotosTakeoutHelperNeo] Download latest GPTH Neo Windows %ARCH%
echo [UpdateGooglePhotosTakeoutHelperNeo] Source: https://github.com/Xentraxx/GooglePhotosTakeoutHelper_Neo

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%" 2>nul

where powershell >nul 2>&1
if errorlevel 1 (
  echo [UpdateGooglePhotosTakeoutHelperNeo] FAIL: PowerShell is required
  goto :end_fail
)

set "PS1=%TEMP%\UpdateGooglePhotosTakeoutHelperNeo.ps1"
> "%PS1%" echo $ErrorActionPreference = 'Stop'
>> "%PS1%" echo $arch = $env:ARCH
>> "%PS1%" echo if (-not $arch) { $arch = 'x64' }
>> "%PS1%" echo $out = Join-Path (Get-Location) 'GooglePhotosTakeoutHelperNeo'
>> "%PS1%" echo $exe = Join-Path $out 'gpth.exe'
>> "%PS1%" echo $ver = Join-Path $out 'version.txt'
>> "%PS1%" echo $hdr = @{ 'User-Agent' = 'bm-google-photos-quota-reclaim'; 'Accept' = 'application/vnd.github+json' }
>> "%PS1%" echo Write-Host '[UpdateGooglePhotosTakeoutHelperNeo] querying GitHub releases...'
>> "%PS1%" echo $rel = Invoke-RestMethod -Headers $hdr -Uri 'https://api.github.com/repos/Xentraxx/GooglePhotosTakeoutHelper_Neo/releases/latest'
>> "%PS1%" echo $pat = 'windows-' + $arch + '\.exe$'
>> "%PS1%" echo $asset = $rel.assets ^| Where-Object { $_.name -match $pat } ^| Select-Object -First 1
>> "%PS1%" echo if (-not $asset) { throw ('No Windows ' + $arch + ' asset on ' + $rel.tag_name) }
>> "%PS1%" echo Write-Host ('[UpdateGooglePhotosTakeoutHelperNeo] ' + $rel.tag_name + '  ' + $asset.name)
>> "%PS1%" echo $tmp = Join-Path $out ($asset.name + '.partial')
>> "%PS1%" echo Invoke-WebRequest -Headers $hdr -Uri $asset.browser_download_url -OutFile $tmp
>> "%PS1%" echo if (Test-Path $exe) { Remove-Item $exe -Force }
>> "%PS1%" echo Move-Item $tmp $exe -Force
>> "%PS1%" echo Set-Content -LiteralPath $ver -Value $rel.tag_name -Encoding ASCII
>> "%PS1%" echo Write-Host ('[UpdateGooglePhotosTakeoutHelperNeo] saved ' + $exe)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "ERR=%ERRORLEVEL%"
del /f /q "%PS1%" 2>nul
if not "%ERR%"=="0" (
  echo [UpdateGooglePhotosTakeoutHelperNeo] FAIL: download
  goto :end_fail
)

if not exist "%OUT_DIR%\%EXE_NAME%" (
  echo [UpdateGooglePhotosTakeoutHelperNeo] FAIL: missing %OUT_DIR%\%EXE_NAME%
  goto :end_fail
)

echo [UpdateGooglePhotosTakeoutHelperNeo] OK: %CD%\%OUT_DIR%\%EXE_NAME%
if exist "%OUT_DIR%\version.txt" (
  set /p GPTH_VER=<"%OUT_DIR%\version.txt"
  echo [UpdateGooglePhotosTakeoutHelperNeo] version !GPTH_VER!
)
echo [UpdateGooglePhotosTakeoutHelperNeo] Optional: put exiftool.exe next to gpth.exe for full EXIF write.
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
