@echo off
setlocal EnableExtensions
cd /d "%~dp0."
if not defined APP_HOME set "APP_HOME=Gui"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js 18+ is required.
  echo Download: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0%APP_HOME%\package.json" (
  echo [ERROR] %APP_HOME%\package.json not found.
  pause
  exit /b 1
)

if not exist "%~dp0%APP_HOME%\node_modules\ws" (
  echo Installing dependencies...
  where npm >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] npm not found. Reinstall Node.js from https://nodejs.org/
    pause
    exit /b 1
  )
  pushd "%~dp0%APP_HOME%"
  call npm install
  if errorlevel 1 (
    popd
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
  popd
)

if /i "%~1"=="--hidden" goto :run
set "LAUNCH_BAT=%~f0"
set "HIDE_VBS=%TEMP%\gphotos-quota-hide.vbs"
> "%HIDE_VBS%" echo Set s=CreateObject("WScript.Shell")
>> "%HIDE_VBS%" echo s.Run Chr(34) ^& WScript.Arguments(0) ^& Chr(34) ^& " --hidden", 0, False
wscript //nologo "%HIDE_VBS%" "%LAUNCH_BAT%"
del /f /q "%HIDE_VBS%" 2>nul
exit /b 0

:run
for %%I in ("%~dp0.") do set "WORK_DIR=%%~fI"
pushd "%~dp0%APP_HOME%"
node server.mjs
set "ERR=%ERRORLEVEL%"
popd
if not "%ERR%"=="0" (
  powershell -NoProfile -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.MessageBox]::Show('Failed to start the app. If this is a fresh copy, open a terminal in Gui and run npm install.','Google Photos Quota Reclaim','OK','Error')"
  exit /b 1
)
exit /b 0
