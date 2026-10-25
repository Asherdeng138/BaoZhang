@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-release.ps1"
if errorlevel 1 (echo.& echo 发布未完成。) else (echo.& echo 发布完成。)
pause
