@echo off
chcp 65001 >nul
setlocal
title EduEval Studio Installer

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo Windows PowerShell was not found.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo Installation did not complete. See the message above.
  pause
)
endlocal
exit /b %RC%
