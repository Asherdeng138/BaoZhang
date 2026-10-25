@echo off
rem Test build: runs Java tests, lint and a signed release APK with the local .tools toolchain.
rem It never overwrites output\BaoZhang-<version>.apk; the APK goes to output\test\ and is NOT for the real phone.
setlocal
cd /d "%~dp0.."
set "ROOT=%CD%"
set "JAVA_HOME=%ROOT%\.tools\jdk\jdk-17.0.20.1+1"
set "ANDROID_HOME=%ROOT%\.tools\android-sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "PATH=%JAVA_HOME%\bin;%PATH%"
if not exist output\test mkdir output\test
set "LOG=%ROOT%\output\test\build.log"
echo [%date% %time%] start > "%LOG%"
call "%ROOT%\.tools\gradle-8.13\bin\gradle.bat" --no-daemon testDebugUnitTest lintRelease assembleRelease >> "%LOG%" 2>&1
if errorlevel 1 (echo GRADLE_FAILED >> "%LOG%" & goto end)
set "APK=%ROOT%\app\build\outputs\apk\release\app-release.apk"
call "%ANDROID_HOME%\build-tools\36.0.0\apksigner.bat" verify --print-certs "%APK%" >> "%LOG%" 2>&1
if errorlevel 1 (echo SIGN_VERIFY_FAILED >> "%LOG%" & goto end)
"%ANDROID_HOME%\build-tools\36.0.0\zipalign.exe" -c -P 16 4 "%APK%" >> "%LOG%" 2>&1
if errorlevel 1 (echo ZIPALIGN_FAILED >> "%LOG%" & goto end)
copy /y "%APK%" "%ROOT%\output\test\BaoZhang-test-build.apk" >> "%LOG%"
echo BUILD_OK >> "%LOG%"
:end
echo [%date% %time%] end >> "%LOG%"
endlocal
