@echo off
rem Release build of the Windows app: install, build, tests (service, UI, real-OCR Electron smoke), package,
rem then smoke-test the packaged program. Log in output\release-build-desktop.log
setlocal
cd /d "%~dp0..\desktop"
set "LOG=%~dp0..\output\release-build-desktop.log"
echo [%date% %time%] start > "%LOG%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0get-node.ps1" >> "%LOG%" 2>&1 || (echo STEP_FAILED get-node >> "%LOG%" & goto end)
set "PATH=%~dp0..\.tools\node;%PATH%"
node --version >> "%LOG%" 2>&1
set "CSC_IDENTITY_AUTO_DISCOVERY=false"
set "ELECTRON_BUILDER_CACHE=%~dp0..\.tools\electron-builder-cache"
call npm install --no-audit --no-fund >> "%LOG%" 2>&1 || (echo STEP_FAILED npm-install >> "%LOG%" & goto end)
call npm run build >> "%LOG%" 2>&1 || (echo STEP_FAILED build >> "%LOG%" & goto end)
call npm test >> "%LOG%" 2>&1 || (echo STEP_FAILED service-test >> "%LOG%" & goto end)
call npx playwright install chromium-headless-shell >> "%LOG%" 2>&1 || (echo STEP_FAILED playwright-browser >> "%LOG%" & goto end)
call npm run test:ui >> "%LOG%" 2>&1 || (echo STEP_FAILED ui-test >> "%LOG%" & goto end)
call npm run smoke >> "%LOG%" 2>&1 || (echo STEP_FAILED smoke >> "%LOG%" & goto end)
call npm run dist >> "%LOG%" 2>&1 || (echo STEP_FAILED dist >> "%LOG%" & goto end)
set "BAOZHANG_PACKAGED=1"
call npm run smoke >> "%LOG%" 2>&1 || (echo STEP_FAILED packaged-smoke >> "%LOG%" & goto end)
echo BUILD_OK >> "%LOG%"
:end
echo [%date% %time%] end >> "%LOG%"
endlocal
