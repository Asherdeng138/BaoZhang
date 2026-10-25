@echo off
rem Release build of the Android app: Java tests, lint, signed release APK (original signing key).
rem Output: output\BaoZhang-<version>.apk + .sha256 ; log in output\release-build-android.log
setlocal
cd /d "%~dp0.."
set "ROOT=%CD%"
set "JAVA_HOME=%ROOT%\.tools\jdk\jdk-17.0.20.1+1"
set "ANDROID_HOME=%ROOT%\.tools\android-sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "PATH=%JAVA_HOME%\bin;%PATH%"
set "LOG=%ROOT%\output\release-build-android.log"
echo [%date% %time%] start > "%LOG%"
call "%ROOT%\.tools\gradle-8.13\bin\gradle.bat" --no-daemon clean testDebugUnitTest lintRelease assembleRelease >> "%LOG%" 2>&1
if errorlevel 1 (echo GRADLE_FAILED >> "%LOG%" & goto end)
set "APK=%ROOT%\app\build\outputs\apk\release\app-release.apk"
call "%ANDROID_HOME%\build-tools\36.0.0\apksigner.bat" verify --print-certs "%APK%" >> "%LOG%" 2>&1
if errorlevel 1 (echo SIGN_VERIFY_FAILED >> "%LOG%" & goto end)
"%ANDROID_HOME%\build-tools\36.0.0\zipalign.exe" -c -P 16 4 "%APK%" >> "%LOG%" 2>&1
if errorlevel 1 (echo ZIPALIGN_FAILED >> "%LOG%" & goto end)
for /f "tokens=2 delims='" %%v in ('findstr /c:"versionName" app\build.gradle') do set "VER=%%v"
copy /y "%APK%" "%ROOT%\output\BaoZhang-%VER%.apk" >> "%LOG%"
echo BUILD_OK %VER% >> "%LOG%"
:end
echo [%date% %time%] end >> "%LOG%"
endlocal
