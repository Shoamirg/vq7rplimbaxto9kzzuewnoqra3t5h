param(
    [string]$Device = 'chrome',
    [int]$WebPort = 8080,
    [string]$ApiUrl = ''
)
$ErrorActionPreference = 'Stop'
$flutterCommand = Get-Command flutter -ErrorAction SilentlyContinue
$flutterPath = if ($flutterCommand) { $flutterCommand.Source } else {
    Join-Path $env:LOCALAPPDATA 'GarageOS\toolchains\flutter\bin\flutter.bat'
}
if (-not (Test-Path -LiteralPath $flutterPath)) {
    throw 'Flutter SDK topilmadi. Flutter 3.47.6 o‘rnating va qayta ishga tushiring.'
}
$appPath = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $appPath
try {
    & $flutterPath pub get
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $runArguments = @('run', '-d', $Device)
    if ($Device -in @('chrome', 'edge')) {
        $runArguments += @('--web-hostname=127.0.0.1', "--web-port=$WebPort")
    }
    if ($ApiUrl) { $runArguments += "--dart-define=API_URL=$ApiUrl" }
    & $flutterPath @runArguments
} finally { Pop-Location }
