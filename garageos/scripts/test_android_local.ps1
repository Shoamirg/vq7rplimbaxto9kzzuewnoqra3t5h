#Requires -Version 7.0
[CmdletBinding()]
param(
    [ValidatePattern('^emulator-[0-9]+$')][string]$Serial = 'emulator-5554',
    [ValidateSet('live', 'smoke')][string]$Suite = 'live'
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$appRoot = Join-Path $repoRoot 'garageos/flutter_app'
$evidence = Join-Path $repoRoot 'ci-evidence/android-mvp'
$sdkRoot = $env:ANDROID_HOME
if (!$sdkRoot) { $sdkRoot = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$adb = Join-Path $sdkRoot 'platform-tools/adb.exe'
if (!(Test-Path -LiteralPath $adb) -or !(Test-Path -LiteralPath $env:JAVA_HOME)) {
    throw 'Configure ANDROID_HOME and JAVA_HOME before running Android acceptance.'
}
$devices = & $adb devices
if (!($devices -match ('^' + [regex]::Escape($Serial) + '\s+device\s*$'))) {
    throw 'Start the selected emulator before running acceptance.'
}
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$defines = @{}
if ($Suite -eq 'live') {
    $ready = Invoke-RestMethod 'http://127.0.0.1:8000/ready' -TimeoutSec 8
    if ($ready.status -ne 'ready') { throw 'The isolated local API is not ready.' }
    $fixture = Get-Content (Join-Path $evidence 'local-fixture.json') -Raw
    $fixtureObject = $fixture | ConvertFrom-Json
    if ($fixtureObject.api_url -ne 'http://127.0.0.1:8000/api/v1') {
        throw 'Only the isolated local fixture is allowed.'
    }
    $revision = & git -C $repoRoot rev-parse HEAD
    if (& git -C $repoRoot status --porcelain) { $revision += '-working-tree' }
    $defines = @{
        API_URL = 'http://10.0.2.2:8000/api/v1'
        BUILD_REVISION = $revision
        MVP_FIXTURE = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($fixture))
    }
}
$encodedDefines = ($defines.GetEnumerator() | ForEach-Object {
    [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_.Key + '=' + $_.Value))
}) -join ','
$target = if ($Suite -eq 'live') { 'android_mvp_live_test.dart' } else { 'android_smoke_test.dart' }
$target = Join-Path $appRoot "integration_test/$target"
$oldSerial = $env:ANDROID_SERIAL
$env:ANDROID_SERIAL = $Serial
$gpsJob = $null
$originalMockMode = $null
try {
    if ($Suite -eq 'live') {
        # Android's test provider supplies synthetic GPS to the real native
        # location plugin. No Dart LocationSource is mocked. Emulator only.
        $mockStatus = (& $adb -s $Serial shell cmd appops get 2000 android:mock_location) -join ' '
        $originalMockMode = if ($mockStatus -match 'mock_location:\s*(allow|deny|ignore|default)') { $Matches[1] } else { 'default' }
        & $adb -s $Serial shell cmd appops set 2000 android:mock_location allow
        & $adb -s $Serial shell cmd location providers add-test-provider gps --requiresSatellite --supportsAltitude
        & $adb -s $Serial shell cmd location providers set-test-provider-enabled gps true
        if ($LASTEXITCODE -ne 0) { throw 'Could not configure synthetic emulator GPS.' }
    }
    $gpsJob = Start-Job -ArgumentList $adb, $Serial, $Suite -ScriptBlock {
        param($adbPath, $device, $suiteName)
        for ($i = 0; $i -lt 240; $i++) {
            if ($suiteName -eq 'live') {
                & $adbPath -s $device shell cmd location providers set-test-provider-location gps --location 41.3,69.2 --accuracy 5 *> $null
            } else {
                & $adbPath -s $device emu geo fix 69.2 41.3 *> $null
            }
            Start-Sleep -Seconds 4
        }
    }
    Push-Location (Join-Path $appRoot 'android')
    try {
        # Never print these arguments: the integration build contains synthetic
        # fixture credentials. Only main.dart builds may become distributable APKs.
        & ./gradlew.bat app:connectedDebugAndroidTest "-Ptarget=$target" `
            '-Ptarget-platform=android-x64' '-Pandroid.injected.androidTest.leaveApksInstalledAfterRun=true' `
            "-Pdart-defines=$encodedDefines" --console=plain `
            *> (Join-Path $evidence "android-$Suite-instrumentation.log")
        $nativeExit = $LASTEXITCODE
    } finally { Pop-Location }
    if ($Suite -eq 'live') {
        $destination = Join-Path $evidence 'native-screens'
        New-Item -ItemType Directory -Path $destination -Force | Out-Null
        $remote = 'code_cache/garageos-mvp-evidence'
        $package = 'uz.garageos.garageos_staff.dev'
        $names = & $adb -s $Serial shell run-as $package ls $remote
        if ($LASTEXITCODE -ne 0) { $names = @() }
        foreach ($name in $names) {
            $name = $name.Trim()
            if ($name -notmatch '^(S[0-9]{2}-[a-z0-9_-]+\.png|acceptance\.json|native-auth\.json)$') { continue }
            $start = [Diagnostics.ProcessStartInfo]::new($adb)
            $start.UseShellExecute = $false
            $start.RedirectStandardOutput = $true
            foreach ($arg in @('-s', $Serial, 'exec-out', 'run-as', $package, 'cat', "$remote/$name")) {
                $start.ArgumentList.Add($arg)
            }
            $process = [Diagnostics.Process]::Start($start)
            $output = [IO.File]::Create((Join-Path $destination $name))
            try { $process.StandardOutput.BaseStream.CopyTo($output) } finally { $output.Dispose() }
            $process.WaitForExit()
            if ($process.ExitCode -ne 0) { throw 'Could not export native evidence.' }
            $process.Dispose()
        }
    }
    if ($nativeExit -ne 0) { throw 'Android acceptance failed; inspect the local instrumentation log and partial evidence.' }
    Write-Output 'Android suite passed. Review the local evidence before marking acceptance.'
} finally {
    if ($gpsJob) {
        Stop-Job $gpsJob -ErrorAction SilentlyContinue
        Remove-Job $gpsJob -Force -ErrorAction SilentlyContinue
    }
    if ($null -ne $originalMockMode) {
        & $adb -s $Serial shell cmd location providers remove-test-provider gps *> $null
        & $adb -s $Serial shell cmd appops set 2000 android:mock_location $originalMockMode *> $null
    }
    $env:ANDROID_SERIAL = $oldSerial
}
