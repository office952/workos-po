@echo off
cd /d "%~dp0"
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0installer\install.mjs"
) else (
  echo WorkOS setup is incomplete.
  exit /b 1
)
