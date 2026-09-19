@echo off
setlocal enableextensions

set "WORKOS_INSTALL_DIR=%~dp0"
if "%WORKOS_INSTALL_DIR:~-1%"=="\" set "WORKOS_INSTALL_DIR=%WORKOS_INSTALL_DIR:~0,-1%"

if not exist "%WORKOS_INSTALL_DIR%\runtime\node.exe" (
  echo WorkOS is not installed here.
  exit /b 1
)
if not exist "%WORKOS_INSTALL_DIR%\installer\uninstall-external.mjs" (
  echo WorkOS uninstall payload is incomplete.
  exit /b 1
)

:make_uninstall_temp
set "WORKOS_UNINSTALL_TEMP=%TEMP%\WorkOS-Uninstall-%RANDOM%-%RANDOM%"
if exist "%WORKOS_UNINSTALL_TEMP%" goto make_uninstall_temp
mkdir "%WORKOS_UNINSTALL_TEMP%" >nul 2>nul
if errorlevel 1 exit /b 1

copy /y "%WORKOS_INSTALL_DIR%\runtime\node.exe" "%WORKOS_UNINSTALL_TEMP%\node.exe" >nul
if errorlevel 1 goto stage_failed
copy /y "%WORKOS_INSTALL_DIR%\installer\uninstall-external.mjs" "%WORKOS_UNINSTALL_TEMP%\uninstall-external.mjs" >nul
if errorlevel 1 goto stage_failed
copy /y "%WORKOS_INSTALL_DIR%\installer\list-executable-pids.vbs" "%WORKOS_UNINSTALL_TEMP%\list-executable-pids.vbs" >nul
if errorlevel 1 goto stage_failed
copy /y "%WORKOS_INSTALL_DIR%\launcher\show-message.vbs" "%WORKOS_UNINSTALL_TEMP%\show-message.vbs" >nul
if errorlevel 1 goto stage_failed

cd /d "%TEMP%"
start "" /b "%WORKOS_UNINSTALL_TEMP%\node.exe" "%WORKOS_UNINSTALL_TEMP%\uninstall-external.mjs" --install-dir "%WORKOS_INSTALL_DIR%" --temp-dir "%WORKOS_UNINSTALL_TEMP%" %*
if errorlevel 1 goto stage_failed

exit /b 0

:stage_failed
cd /d "%TEMP%"
rmdir /s /q "%WORKOS_UNINSTALL_TEMP%" >nul 2>nul
echo WorkOS could not prepare the uninstall process.
exit /b 1
