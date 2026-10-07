param([string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'GarageOS/jenkins'))
$ErrorActionPreference = 'Stop'
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$config = Get-Content -LiteralPath (Join-Path $InstallRoot 'runtime.json') -Raw | ConvertFrom-Json
$env:JENKINS_HOME = Join-Path $InstallRoot 'home'
$env:GARAGEOS_PYTHON = $config.python
$env:GARAGEOS_FLUTTER = $config.flutter
$env:GARAGEOS_PGBIN = $config.pgbin
$env:PYTHONUTF8 = '1'
$toolDirs = @((Split-Path $config.python), (Split-Path $config.flutter), $config.pgbin,
    (Split-Path $config.node), (Split-Path $config.git), (Split-Path $config.gh))
$env:PATH = ($toolDirs -join ';') + ';' + $env:PATH

function Start-OwnedJava([string]$Name, [string[]]$JavaArguments) {
    $identityFile = Join-Path $InstallRoot "$Name.json"
    if (Test-Path -LiteralPath $identityFile) {
        $identity = Get-Content -LiteralPath $identityFile -Raw | ConvertFrom-Json
        $existing = Get-Process -Id $identity.pid -ErrorAction SilentlyContinue
        if ($existing -and $existing.Path -eq $config.java -and
            $existing.StartTime.ToUniversalTime().Ticks -eq ([datetime]$identity.started).ToUniversalTime().Ticks) {
            return
        }
    }
    if ($Name -eq 'controller' -and (Get-NetTCPConnection -LocalPort 8180 -State Listen -ErrorAction SilentlyContinue)) {
        throw 'Port8180 belongs to an unrecognized process; refusing to start another controller'
    }
    $process = Start-Process -FilePath $config.java -ArgumentList $JavaArguments -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $InstallRoot "$Name.stdout.log") `
        -RedirectStandardError (Join-Path $InstallRoot "$Name.stderr.log")
    @{pid=$process.Id; started=$process.StartTime.ToUniversalTime().ToString('o')} |
        ConvertTo-Json | Set-Content -LiteralPath $identityFile -Encoding UTF8
}

Start-OwnedJava 'controller' @('-Xmx768m', '-Djenkins.install.runSetupWizard=false', '-jar',
    ('"' + (Join-Path $InstallRoot 'downloads/jenkins.war') + '"'), '--httpListenAddress=127.0.0.1', '--httpPort=8180')
$base = 'http://127.0.0.1:8180'
$ready = $false
for ($attempt = 0; $attempt -lt 120; $attempt++) {
    try {
        $response = Invoke-WebRequest -Uri "$base/login" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200 -and $response.Headers['X-Jenkins']) {
            $ready = $true
            break
        }
    } catch {}
    Start-Sleep -Seconds 1
}
if (-not $ready) {throw 'Jenkins readiness failed; inspect controller.stderr.log'}
$agentJar = Join-Path $InstallRoot 'agent.jar'
if (-not (Test-Path -LiteralPath $agentJar)) {
    Invoke-WebRequest -Uri "$base/jnlpJars/agent.jar" -OutFile $agentJar -UseBasicParsing
}
Start-OwnedJava 'build-agent' @('-Xmx256m', '-jar', ('"' + $agentJar + '"'), '-url', "$base/",
    '-name', 'garageos-windows', '-secret', ('"@' + (Join-Path $InstallRoot 'agent.secret') + '"'),
    '-webSocket', '-workDir', ('"' + (Join-Path $InstallRoot 'agent') + '"'))
Write-Output 'Jenkins and its Windows agent started at http://127.0.0.1:8180/'
