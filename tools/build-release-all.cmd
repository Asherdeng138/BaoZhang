@echo off
rem Builds the Android release APK, then the Windows release (logs in output\).
call "%~dp0build-release-android.cmd"
call "%~dp0build-release-desktop.cmd"
