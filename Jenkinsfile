// Loaded by the local trusted-branch bootstrap on the garageos-windows agent.
def runChecks() {
    timeout(time: 90, unit: 'MINUTES') {
        try {
            stage('Windows CI · isolated database · full workflows') {
                def result = powershell(returnStatus: true, script: '''
                    $env:PYTHONUTF8 = '1'
                    & $env:GARAGEOS_PYTHON garageos/scripts/jenkins_windows_ci.py --allow-missing-docker
                    exit $LASTEXITCODE
                ''')
                if (result == 3) {
                    unstable('Application gates passed; Docker production routing/build-context/recovery/invoice-volume gates unavailable on this PC.')
                } else if (result != 0) {
                    error("GarageOS CI failed (${result}); inspect archived gate logs.")
                }
            }
        } finally {
            stage('Reports and owned fixture cleanup') {
                def cleanupResult = powershell(returnStatus: true, script: '''
                    $env:PYTHONUTF8 = '1'
                    & $env:GARAGEOS_PYTHON garageos/scripts/jenkins_windows_ci.py --cleanup-only
                    exit $LASTEXITCODE
                ''')
                junit testResults: "ci-evidence/${env.BUILD_NUMBER}/backend.xml", allowEmptyResults: true
                archiveArtifacts artifacts: "ci-evidence/${env.BUILD_NUMBER}/**", allowEmptyArchive: true
                if (cleanupResult != 0) {
                    error('Owned fixture cleanup failed; inspect the build logs before retrying.')
                }
            }
        }
    }
}
return this
