@echo off
setlocal EnableExtensions
cd /d "%~dp0."

set "DIST_DIR=dist"
set "STAGE=%DIST_DIR%\_stage"
set "ZIP_NAME=bm-google-photos-quota-reclaim.zip"
set "DIST_ZIP=%DIST_DIR%\%ZIP_NAME%"
set "LAUNCHER=Google Photos Quota Reclaim.bat"

echo [build_win10] Build Win10 portable zip: %DIST_ZIP%
echo [build_win10] cleaning %DIST_DIR% contents, zip in %DIST_DIR%

if not exist "Gui\package.json" (
  echo [build_win10] FAIL: missing Gui\package.json ^(run from repo root^)
  goto :end_fail
)
if not exist "Gui\server.mjs" (
  echo [build_win10] FAIL: missing Gui\server.mjs
  goto :end_fail
)

where node >nul 2>&1
if errorlevel 1 (
  echo [build_win10] FAIL: node not in PATH ^(install Node.js 18+^)
  goto :end_fail
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [build_win10] FAIL: npm not in PATH
  goto :end_fail
)

echo [build_win10] using:
node -v
call npm -v

if not exist "GooglePhotosTakeoutHelperNeo\gpth.exe" (
  echo [build_win10] gpth.exe missing — running UpdateGooglePhotosTakeoutHelperNeo.bat
  call UpdateGooglePhotosTakeoutHelperNeo.bat nopause
)
if not exist "GooglePhotosTakeoutHelperNeo\gpth.exe" (
  echo [build_win10] FAIL: missing GooglePhotosTakeoutHelperNeo\gpth.exe
  goto :end_fail
)

if not exist "adb\adb.exe" (
  echo [build_win10] adb.exe missing — running UpdatePlatformTools.bat
  call UpdatePlatformTools.bat nopause
)
if not exist "adb\adb.exe" (
  echo [build_win10] FAIL: missing adb\adb.exe
  goto :end_fail
)

if not exist "%DIST_DIR%" mkdir "%DIST_DIR%" 2>nul
call :clean_dir_contents "%DIST_DIR%"

mkdir "%STAGE%\source\api" 2>nul
mkdir "%STAGE%\source\lib" 2>nul
mkdir "%STAGE%\source\steps" 2>nul
mkdir "%STAGE%\downloads" 2>nul
mkdir "%STAGE%\adb" 2>nul
mkdir "%STAGE%\GooglePhotosTakeoutHelperNeo" 2>nul

echo [build_win10] copying Gui sources
xcopy /E /I /Y /Q "Gui\api" "%STAGE%\source\api" >nul
if errorlevel 1 goto :copy_fail
xcopy /E /I /Y /Q "Gui\lib" "%STAGE%\source\lib" >nul
if errorlevel 1 goto :copy_fail
xcopy /E /I /Y /Q "Gui\steps" "%STAGE%\source\steps" >nul
if errorlevel 1 goto :copy_fail
copy /Y "Gui\index.html" "%STAGE%\source\index.html" >nul
if errorlevel 1 goto :copy_fail
copy /Y "Gui\package.json" "%STAGE%\source\package.json" >nul
if errorlevel 1 goto :copy_fail
copy /Y "Gui\server.mjs" "%STAGE%\source\server.mjs" >nul
if errorlevel 1 goto :copy_fail
echo [build_win10] copying adb Platform Tools
xcopy /E /I /Y /Q "adb" "%STAGE%\adb" >nul
if errorlevel 1 goto :copy_fail
if not exist "%STAGE%\adb\adb.exe" goto :copy_fail
if exist "UpdatePlatformTools.bat" copy /Y "UpdatePlatformTools.bat" "%STAGE%\UpdatePlatformTools.bat" >nul
copy /Y "GooglePhotosTakeoutHelperNeo\gpth.exe" "%STAGE%\GooglePhotosTakeoutHelperNeo\gpth.exe" >nul
if errorlevel 1 goto :copy_fail
if exist "GooglePhotosTakeoutHelperNeo\README.md" copy /Y "GooglePhotosTakeoutHelperNeo\README.md" "%STAGE%\GooglePhotosTakeoutHelperNeo\README.md" >nul
if exist "GooglePhotosTakeoutHelperNeo\version.txt" copy /Y "GooglePhotosTakeoutHelperNeo\version.txt" "%STAGE%\GooglePhotosTakeoutHelperNeo\version.txt" >nul
if exist "GooglePhotosTakeoutHelperNeo\exiftool.exe" copy /Y "GooglePhotosTakeoutHelperNeo\exiftool.exe" "%STAGE%\GooglePhotosTakeoutHelperNeo\exiftool.exe" >nul
if exist "UpdateGooglePhotosTakeoutHelperNeo.bat" copy /Y "UpdateGooglePhotosTakeoutHelperNeo.bat" "%STAGE%\UpdateGooglePhotosTakeoutHelperNeo.bat" >nul
echo [build_win10] bundled GooglePhotosTakeoutHelperNeo\gpth.exe
goto :after_copy

:copy_fail
echo [build_win10] FAIL: copy sources
goto :end_fail

:after_copy
echo [build_win10] npm install --omit=dev
pushd "%STAGE%\source"
call npm install --omit=dev
if errorlevel 1 (
  popd
  echo [build_win10] FAIL: npm install
  goto :end_fail
)
popd

echo [build_win10] writing launcher and downloads README
copy /Y "Google Photos Quota Reclaim.bat" "%STAGE%\%LAUNCHER%" >nul
if errorlevel 1 goto :copy_fail
powershell -NoProfile -Command "$f = Join-Path (Get-Location) '%STAGE%\%LAUNCHER%'; $c = Get-Content -LiteralPath $f -Raw; $c = $c.Replace('APP_HOME=Gui','APP_HOME=source'); Set-Content -LiteralPath $f -Value $c -Encoding ASCII"

(
  echo Place photo files here, then use Match in the app.
  echo You can delete this README.md — the app scans this folder for media files.
) > "%STAGE%\downloads\README.md"

if exist "%DIST_ZIP%" del /f /q "%DIST_ZIP%"

echo [build_win10] archiving %ZIP_NAME%

where 7z >nul 2>&1
if not errorlevel 1 (
  7z a -tzip -mx=5 "%DIST_ZIP%" ".\%STAGE%\*" >nul
  if not errorlevel 1 if exist "%DIST_ZIP%" goto :zip_ok
)

where tar >nul 2>&1
if not errorlevel 1 (
  tar -caf "%DIST_ZIP%" -C "%STAGE%" "Google Photos Quota Reclaim.bat" source downloads adb GooglePhotosTakeoutHelperNeo UpdateGooglePhotosTakeoutHelperNeo.bat UpdatePlatformTools.bat
  if not errorlevel 1 if exist "%DIST_ZIP%" goto :zip_ok
)

powershell -NoProfile -Command "Compress-Archive -Path '%CD%\%STAGE%\*' -DestinationPath '%CD%\%DIST_ZIP%' -Force"
if errorlevel 1 (
  echo [build_win10] FAIL: zip failed; install 7-Zip ^(7z^) or use Windows tar / PS Compress-Archive
  goto :end_fail
)
if not exist "%DIST_ZIP%" (
  echo [build_win10] FAIL: missing %DIST_ZIP%
  goto :end_fail
)

:zip_ok
rd /s /q "%DIST_DIR%\_stage" 2>nul

echo [build_win10] OK: %CD%\%DIST_ZIP%
echo [build_win10] Unzip and run "%LAUNCHER%"
echo [build_win10] Includes adb\adb.exe and GooglePhotosTakeoutHelperNeo\gpth.exe
echo [build_win10] Requires Node.js 18+ on the target machine.
goto :end_ok

rem Same pattern as bm-ani-gamer-plus / bm-http-file-server3 / bm-ok-nte: wipe contents, keep the folder.
:clean_dir_contents
set "TGT=%~1"
if not exist "%TGT%" exit /b 0
for /f "delims=" %%D in ('dir /b /ad "%TGT%" 2^>nul') do rd /s /q "%TGT%\%%D" 2>nul
del /f /q "%TGT%\*" 2>nul
exit /b 0

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
