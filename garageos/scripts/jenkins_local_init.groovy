// Copy into the protected local JENKINS_HOME/init.groovy.d after installing plugins.
import groovy.json.JsonSlurper
import hudson.model.Node
import hudson.security.HudsonPrivateSecurityRealm
import hudson.security.FullControlOnceLoggedInAuthorizationStrategy
import hudson.slaves.DumbSlave
import hudson.slaves.JNLPLauncher
import hudson.slaves.RetentionStrategy
import jenkins.model.Jenkins
import jenkins.model.JenkinsLocationConfiguration
import jenkins.install.InstallState
import org.jenkinsci.plugins.workflow.job.WorkflowJob
import org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition

def jenkins = Jenkins.get()
def installation = jenkins.rootDir.parentFile
def marker = new File(installation, 'configured')
def initialSetup = !marker.exists()
if (initialSetup) {
    def account = new JsonSlurper().parse(new File(installation, 'admin.json'))
    def realm = new HudsonPrivateSecurityRealm(false)
    realm.createAccount(account.username, account.password)
    jenkins.setSecurityRealm(realm)
    def authorization = new FullControlOnceLoggedInAuthorizationStrategy()
    authorization.setAllowAnonymousRead(false)
    jenkins.setAuthorizationStrategy(authorization)
    jenkins.setInstallState(InstallState.INITIAL_SETUP_COMPLETED)
}
jenkins.setNumExecutors(0)
JenkinsLocationConfiguration.get().setUrl('http://127.0.0.1:8180/')
def name = 'garageos-windows'
if (jenkins.getNode(name) == null) {
    jenkins.addNode(new DumbSlave(name, 'Trusted local Windows CI',
        new File(installation, 'agent').absolutePath, '1', Node.Mode.EXCLUSIVE,
        name, new JNLPLauncher(), new RetentionStrategy.Always(), []))
}
new File(installation, 'agent.secret').text = jenkins.getComputer(name).getJnlpMac()
def job = jenkins.getItem('GarageOS-Windows-CI') ?: jenkins.createProject(WorkflowJob, 'GarageOS-Windows-CI')
    job.description = 'Trusted codex/service-work-demo branch. Independent Windows checkout and fresh test database. No deployment.'
    job.definition = new CpsFlowDefinition('''
node('garageos-windows') {
    properties([
        disableConcurrentBuilds(),
        buildDiscarder(logRotator(numToKeepStr: '10', artifactNumToKeepStr: '5')),
        parameters([booleanParam(name: 'FORCE_RUN', defaultValue: false, description: 'Retry this SHA even when already attempted')]),
        pipelineTriggers([cron('H/5 * * * *')])
    ])
    timeout(time: 50, unit: 'MINUTES') {
        dir('checkout') {
            def shouldBuild = true
            stage('Checkout trusted branch') {
                powershell(''' + "'''" + '''
                    $ErrorActionPreference = 'Stop'
                    $env:GIT_TERMINAL_PROMPT = '0'
                    $helper = '!gh auth git-credential'
                    if (-not (Test-Path -LiteralPath '.git')) {
                        git -c credential.helper= -c "credential.helper=$helper" clone --single-branch --branch codex/service-work-demo https://github.com/Shoamirg/garageos.git .
                        if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}
                    }
                    git -c credential.helper= -c "credential.helper=$helper" fetch origin codex/service-work-demo
                    if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}
                    git reset --hard origin/codex/service-work-demo
                    exit $LASTEXITCODE
                ''' + "'''" + ''')
                def sha = powershell(returnStdout: true, script: 'git rev-parse HEAD').trim()
                def previous = fileExists('../last-attempted-sha') ? readFile('../last-attempted-sha').trim() : ''
                currentBuild.description = sha.take(12)
                if (params.FORCE_RUN != true && sha == previous) {
                    currentBuild.description = 'Unchanged ' + sha.take(12)
                    currentBuild.result = 'NOT_BUILT'
                    echo 'No new commit; use FORCE_RUN to retry.'
                    shouldBuild = false
                } else {
                    writeFile file: '../last-attempted-sha', text: sha
                }
            }
            if (!shouldBuild) { return }
            def checks = load 'Jenkinsfile'
            checks.runChecks()
        }
    }
}
''', true)
    job.save()
jenkins.save()
if (initialSetup) {
    marker.text = 'configured\n'
}
