param([switch]$AcceptSdkLicense, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$projectDir = $PSScriptRoot
Set-Location -LiteralPath $projectDir
$toolDir = Join-Path $projectDir '.tools'
$outputDir = Join-Path $projectDir 'output'
if ($CheckOnly) {
    $javaAvailable = [bool](Get-Command java -ErrorAction SilentlyContinue)
    $javaHomeAvailable = $env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))
    $localJavaAvailable = Test-Path (Join-Path $toolDir 'jdk')
    $sdkAvailable = Test-Path (Join-Path $toolDir 'android-sdk\platforms\android-36\android.jar')
    [PSCustomObject]@{JavaOnPath=$javaAvailable;JavaHome=$javaHomeAvailable;LocalJdk=$localJavaAvailable;LocalAndroid36Sdk=$sdkAvailable}
    if (-not ($javaAvailable -or $javaHomeAvailable -or $localJavaAvailable) -or -not $sdkAvailable) { exit 2 }
    exit 0
}
New-Item -ItemType Directory -Path $toolDir,$outputDir -Force | Out-Null
function Download-Checked([string]$Url,[string]$Destination,[string]$Sha256) {
    if (Test-Path -LiteralPath $Destination) {
        if ((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -eq $Sha256) { return }
    }
    $part = $Destination + '.part'
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $part -TimeoutSec 900
    $actual = (Get-FileHash -LiteralPath $part -Algorithm SHA256).Hash
    if ($actual -ne $Sha256) { throw "SHA256 check failed: $Destination" }
    Move-Item -LiteralPath $part -Destination $Destination -Force
}
if (-not $AcceptSdkLicense) {
    Write-Host 'This builds your personal Android app. The first run downloads JDK, Gradle and Android SDK into .tools.'
    Write-Host 'Android SDK terms: https://developer.android.com/studio#terms-and-conditions'
    $answer = Read-Host 'Accept the Android SDK license and continue? [y/N]'
    if ($answer -notmatch '^[yY]$') { throw 'Build cancelled before downloads.' }
}
# A local toolchain keeps existing Java and Android installations unchanged.
$jdkDir = Join-Path $toolDir 'jdk'
$jdk = Get-ChildItem -LiteralPath $jdkDir -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') } | Select-Object -First 1
if (-not $jdk) {
    Write-Host '[1/5] Downloading Eclipse Temurin JDK 17...'
    $assets = Invoke-RestMethod -Uri 'https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
    $package = $assets[0].binary.package
    $archive = Join-Path $toolDir 'jdk17.zip'
    Download-Checked $package.link $archive $package.checksum
    New-Item -ItemType Directory -Path $jdkDir -Force | Out-Null
    Expand-Archive -LiteralPath $archive -DestinationPath $jdkDir -Force
    $jdk = Get-ChildItem -LiteralPath $jdkDir -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') } | Select-Object -First 1
}
if (-not $jdk) { throw 'JDK installation failed.' }
$env:JAVA_HOME = $jdk.FullName
$env:PATH = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:PATH
$gradleDir = Join-Path $toolDir 'gradle-8.13'
if (-not (Test-Path (Join-Path $gradleDir 'bin\gradle.bat'))) {
    Write-Host '[2/5] Downloading Gradle 8.13...'
    $gradleUrl = 'https://services.gradle.org/distributions/gradle-8.13-bin.zip'
    $gradleHash = (Invoke-WebRequest -UseBasicParsing -Uri ($gradleUrl+'.sha256')).Content.Trim()
    $archive = Join-Path $toolDir 'gradle-8.13-bin.zip'
    Download-Checked $gradleUrl $archive $gradleHash
    Expand-Archive -LiteralPath $archive -DestinationPath $toolDir -Force
}
$sdkDir = Join-Path $toolDir 'android-sdk'
$sdkManager = Join-Path $sdkDir 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path -LiteralPath $sdkManager)) {
    Write-Host '[3/5] Downloading Android command-line tools...'
    $archive = Join-Path $toolDir 'android-commandline.zip'
    Download-Checked 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip' $archive '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
    $stage = Join-Path $toolDir 'commandline-stage'
    Expand-Archive -LiteralPath $archive -DestinationPath $stage -Force
    $latestDir = Join-Path $sdkDir 'cmdline-tools\latest'
    New-Item -ItemType Directory -Path $latestDir -Force | Out-Null
    Copy-Item -Path (Join-Path $stage 'cmdline-tools\*') -Destination $latestDir -Recurse -Force
}
$env:ANDROID_HOME=$sdkDir
$env:ANDROID_SDK_ROOT=$sdkDir
Write-Host '[4/5] Installing API 36 and build tools...'
1..100 | ForEach-Object { 'y' } | & $sdkManager "--sdk_root=$sdkDir" '--licenses'
if ($LASTEXITCODE -ne 0) { throw 'Android SDK license setup failed.' }
& $sdkManager "--sdk_root=$sdkDir" 'platforms;android-36' 'build-tools;36.0.0' 'platform-tools'
if ($LASTEXITCODE -ne 0) { throw 'Android SDK installation failed.' }
$sdkProperty = 'sdk.dir=' + $sdkDir.Replace('\','/').Replace(':','\:')
[IO.File]::WriteAllText((Join-Path $projectDir 'local.properties'),$sdkProperty,[Text.UTF8Encoding]::new($false))
$signingProperties = Join-Path $toolDir 'signing.properties'
if (-not (Test-Path -LiteralPath $signingProperties)) {
    $randomBytes=New-Object byte[] 32
    $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($randomBytes)
    $rng.Dispose()
    $signPassword=[Convert]::ToBase64String($randomBytes)
    $keyFile=Join-Path $toolDir 'personal-release.p12'
    if (Test-Path -LiteralPath $keyFile) { throw 'Signing key exists without properties. Restore .tools/signing.properties before building.' }
    $env:BAOZHANG_SIGN_PASSWORD=$signPassword
    & (Join-Path $env:JAVA_HOME 'bin\keytool.exe') -genkeypair -keystore $keyFile -storetype PKCS12 -storepass:env BAOZHANG_SIGN_PASSWORD -keypass:env BAOZHANG_SIGN_PASSWORD -alias baozhang -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=BaoZhang Personal,OU=Personal App,O=Personal,C=GB'
    if ($LASTEXITCODE -ne 0) { throw 'Signing key generation failed.' }
    $properties="storeFile=.tools/personal-release.p12`nstorePassword=$signPassword`nkeyAlias=baozhang`nkeyPassword=$signPassword`n"
    [IO.File]::WriteAllText($signingProperties,$properties,[Text.UTF8Encoding]::new($false))
    Remove-Item Env:BAOZHANG_SIGN_PASSWORD
}
Write-Host '[5/5] Testing and compiling the APK...'
& (Join-Path $gradleDir 'bin\gradle.bat') --no-daemon testDebugUnitTest lintRelease assembleRelease
if ($LASTEXITCODE -ne 0) { throw 'Build or tests failed. Read the first error above.' }
$apk=Join-Path $projectDir 'app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path -LiteralPath $apk)) { throw 'Signed APK was not produced.' }
& (Join-Path $sdkDir 'build-tools\36.0.0\apksigner.bat') verify --verbose $apk
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
& (Join-Path $sdkDir 'build-tools\36.0.0\zipalign.exe') -c -P 16 4 $apk
if ($LASTEXITCODE -ne 0) { throw 'APK archive alignment verification failed.' }
$target=Join-Path $outputDir 'BaoZhang-0.1.0.apk'
Copy-Item -LiteralPath $apk -Destination $target -Force
(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash | Set-Content -LiteralPath ($target+'.sha256') -Encoding ascii
Write-Host "Success: $target"
Write-Host 'Keep .tools/personal-release.p12 AND .tools/signing.properties private and backed up. Future app updates need the same key.'
Write-Host 'Install the APK on your phone, then test camera, gallery, OCR and exports before using it for actual claims.'
