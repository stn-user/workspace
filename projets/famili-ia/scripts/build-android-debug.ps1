param([switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$project = Split-Path -Parent $PSScriptRoot
$localTools = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'FamiliIA\toolchains'
$javaHome = $env:JAVA_HOME
if (-not $javaHome) { $javaHome = Join-Path $localTools 'jdk-21' }
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) { $sdk = Join-Path $localTools 'android-sdk' }
$javaHome = [IO.Path]::GetFullPath($javaHome)
$sdk = [IO.Path]::GetFullPath($sdk)

if ($env:ANDROID_HOME -and $env:ANDROID_SDK_ROOT -and
    [IO.Path]::GetFullPath($env:ANDROID_HOME).TrimEnd('\') -ne [IO.Path]::GetFullPath($env:ANDROID_SDK_ROOT).TrimEnd('\')) {
    throw 'ANDROID_HOME and ANDROID_SDK_ROOT must point to the same SDK.'
}

$java = Join-Path $javaHome 'bin\java.exe'
if (-not (Test-Path -LiteralPath $java -PathType Leaf)) {
    throw 'JDK 21 not found. Set JAVA_HOME or install it in %LOCALAPPDATA%\FamiliIA\toolchains\jdk-21.'
}
$javaVersion = @(& $java --version)
if ($LASTEXITCODE -ne 0 -or $javaVersion[0] -notmatch '^(openjdk|java) 21(\.|\s|$)') {
    throw 'This build requires JDK 21.'
}
$nodeVersion = & node --version
if ($LASTEXITCODE -ne 0 -or [version]($nodeVersion.TrimStart('v')) -lt [version]'22.12.0') {
    throw 'Vite 8 and Capacitor 8 require Node.js 22.12 or newer.'
}

$variables = Get-Content -LiteralPath (Join-Path $project 'android\variables.gradle') -Raw
$compileSdk = [regex]::Match($variables, 'compileSdkVersion\s*=\s*(\d+)')
if (-not $compileSdk.Success) { throw 'Cannot determine compileSdkVersion from android\variables.gradle.' }
$platform = 'platforms\android-' + $compileSdk.Groups[1].Value + '\android.jar'
$buildTools = Join-Path $sdk 'build-tools\35.0.0'
foreach ($required in @((Join-Path $sdk $platform), (Join-Path $buildTools 'apksigner.bat'), (Join-Path $buildTools 'aapt.exe'))) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "Missing Android SDK component: $required. Install the selected platform and Build Tools 35.0.0."
    }
}

$config = Get-Content -LiteralPath (Join-Path $project 'capacitor.config.json') -Raw | ConvertFrom-Json
if ($config.webDir -ne 'dist') { throw 'This build expects capacitor.config.json webDir to be dist.' }
if ($config.PSObject.Properties.Name -contains 'server' -and
    $config.server.PSObject.Properties.Name -contains 'url' -and $config.server.url) {
    throw 'Remove server.url before packaging. The Debug APK must use bundled assets, not a development server.'
}

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
Write-Output "Java: $($javaVersion[0])"
Write-Output "Node: $nodeVersion"
Write-Output "Android SDK: $sdk"
Write-Output "Platform: android-$($compileSdk.Groups[1].Value); Build Tools: 35.0.0"
if ($CheckOnly) { return }

Push-Location $project
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed; APK build stopped.' }
    & npx.cmd --no-install cap sync android
    if ($LASTEXITCODE -ne 0) { throw 'Capacitor Android sync failed; APK build stopped.' }
    Push-Location (Join-Path $project 'android')
    try {
        & .\gradlew.bat --no-daemon --max-workers=2 :app:assembleDebug
        if ($LASTEXITCODE -ne 0) { throw 'Gradle Debug build failed.' }
    } finally {
        Pop-Location
    }
} finally {
    Pop-Location
}

$apk = Join-Path $project 'android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path -LiteralPath $apk -PathType Leaf)) { throw 'Gradle finished without the expected Debug APK.' }
& (Join-Path $buildTools 'apksigner.bat') verify $apk
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
$badging = @(& (Join-Path $buildTools 'aapt.exe') dump badging $apk)
if ($LASTEXITCODE -ne 0) { throw 'Cannot read the packaged Android manifest.' }
$expectedPackage = "^package: name='$([regex]::Escape($config.appId))'"
if (-not ($badging -match $expectedPackage)) { throw 'APK package does not match capacitor.config.json appId.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($apk)
try {
    if (-not $archive.GetEntry('assets/public/index.html')) { throw 'APK does not contain the bundled web entry point.' }
} finally {
    $archive.Dispose()
}
Write-Output ($badging | Select-String "^(package:|sdkVersion:|targetSdkVersion:|application-debuggable)" | ForEach-Object { $_.Line })
if (-not ($badging -match '^application-debuggable')) { throw 'Expected a debuggable APK, not a release artifact.' }
Write-Output "Debug APK verified (not a store release): $apk"
Write-Output "Size: $((Get-Item -LiteralPath $apk).Length) bytes"
Write-Output "SHA256: $((Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash)"
