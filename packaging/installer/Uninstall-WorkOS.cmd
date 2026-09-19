@echo off
cd /d "%~dp0"
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0installer\uninstall.mjs"
) else (
  echo WorkOS is not installed here.
  exit /b 1
)
