param(
    [Parameter(Mandatory = $true)][string]$DatabaseUrl,
    [Parameter(Mandatory = $true)][string]$ArtifactPath,
    [int]$Port = 4173
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"

& "$PSScriptRoot/guard.ps1" -DatabaseUrls @($DatabaseUrl) | Out-Null
& "$PSScriptRoot/preflight.ps1" -DatabaseUrl $DatabaseUrl | Out-Null

$root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$artifactDir = Split-Path -Parent $ArtifactPath
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
$stdoutPath = Join-Path $artifactDir "app-stdout.log"
$stderrPath = Join-Path $artifactDir "app-stderr.log"

Push-Location $root
try {
    $env:NODE_ENV = "production"
    $env:DATABASE_URL = $DatabaseUrl
    $env:PORT = "$Port"
    $env:JWT_SECRET = "ci-rehearsal-only-not-a-secret"
    $env:VITE_APP_ID = "ci-rehearsal"
    $env:OAUTH_SERVER_URL = "http://127.0.0.1:9"
    $env:OWNER_OPEN_ID = "ci-rehearsal"
    $env:BUILT_IN_FORGE_API_URL = ""
    $env:BUILT_IN_FORGE_API_KEY = ""

    & pnpm build
    if ($LASTEXITCODE -ne 0) { throw "FAIL: production build failed before smoke" }

    $process = Start-Process -FilePath "node" -ArgumentList @("dist/index.js") -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    try {
        $rootResponse = $null
        for ($attempt = 1; $attempt -le 40; $attempt++) {
            Start-Sleep -Seconds 1
            try {
                $rootResponse = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -TimeoutSec 2
                if ($rootResponse.StatusCode -eq 200) { break }
            } catch {
                $process.Refresh()
                if ($process.HasExited) { throw "FAIL: application exited before readiness; see $stderrPath" }
            }
        }
        if ($null -eq $rootResponse -or $rootResponse.StatusCode -ne 200) { throw "FAIL: application root endpoint did not become ready" }

        $healthResponse = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/trpc/observability.health?input=%7B%22json%22%3Anull%7D" -TimeoutSec 10
        if ($healthResponse.StatusCode -ne 200) { throw "FAIL: public health RPC returned $($healthResponse.StatusCode)" }
        $healthEnvelope = $healthResponse.Content | ConvertFrom-Json
        $health = $healthEnvelope.result.data.json
        if ($null -eq $health -or -not $health.db.connected -or $health.status -ne "ok" -or -not $health.decisionEngineReady) {
            throw "FAIL: readiness semantic assertion failed"
        }

        $result = [pscustomobject]@{
            status = "PASS"
            environment = "isolated_rehearsal"
            database = (Get-RehearsalConnection $DatabaseUrl).Database
            rootHttpStatus = $rootResponse.StatusCode
            healthHttpStatus = $healthResponse.StatusCode
            health = $health
            stdout = (Split-Path -Leaf $stdoutPath)
            stderr = (Split-Path -Leaf $stderrPath)
        }
        Write-RehearsalArtifact -Path $ArtifactPath -Value $result
        Write-Host "PASS: application readiness smoke"
    } finally {
        if ($null -ne $process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    }
} catch {
    $failure = [pscustomobject]@{
        status = "FAIL"
        environment = "isolated_rehearsal"
        database = (Get-RehearsalConnection $DatabaseUrl).Database
        error = $_.Exception.Message
        stdout = (Split-Path -Leaf $stdoutPath)
        stderr = (Split-Path -Leaf $stderrPath)
    }
    Write-RehearsalArtifact -Path $ArtifactPath -Value $failure
    throw
} finally {
    Pop-Location
}
