Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"

$artifactRoot = Join-Path $PWD "artifacts/rehearsal"
New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null
$results = [System.Collections.Generic.List[object]]::new()

function Invoke-Scenario {
    param([string]$Name, [scriptblock]$Body)
    $started = [DateTime]::UtcNow
    try {
        $evidence = & $Body
        $result = [pscustomobject]@{ scenario=$Name; status="PASS"; startedAt=$started.ToString("o"); finishedAt=[DateTime]::UtcNow.ToString("o"); evidence=@($evidence) }
    } catch {
        $message = $_.Exception.Message
        $status = if ($message -like "BLOCKED:*") { "BLOCKED" } else { "FAIL" }
        $result = [pscustomobject]@{ scenario=$Name; status=$status; startedAt=$started.ToString("o"); finishedAt=[DateTime]::UtcNow.ToString("o"); error=$message }
        Write-Error "$status $Name`: $message" -ErrorAction Continue
    }
    $results.Add($result)
    Write-RehearsalArtifact -Path (Join-Path $artifactRoot "$Name.json") -Value $result
}

$urls = @(
    $env:REHEARSAL_DATABASE_URL,
    $env:REHEARSAL_UPGRADE_DATABASE_URL,
    $env:REHEARSAL_RESTORE_DATABASE_URL,
    $env:REHEARSAL_LOCK_DATABASE_URL
)

Invoke-Scenario "guard" {
    & "$PSScriptRoot/guard.ps1" -DatabaseUrls $urls
    $original = $env:REHEARSAL_ENV
    try {
        $env:REHEARSAL_ENV = "1"
        & "$PSScriptRoot/guard.ps1" -DatabaseUrls "mysql://rehearsal:rehearsal@127.0.0.1/production" 2>$null
        throw "FAIL: guard accepted a production database"
    } catch {
        if ($_.Exception.Message -like "FAIL:*") { throw }
        "production URL rejected"
    } finally { $env:REHEARSAL_ENV = $original }
}

Invoke-Scenario "preflight" { & "$PSScriptRoot/preflight.ps1" -DatabaseUrl $env:REHEARSAL_DATABASE_URL }

Invoke-Scenario "clean-install" {
    & "$PSScriptRoot/migrate.ps1" -DatabaseUrl $env:REHEARSAL_DATABASE_URL
    & "$PSScriptRoot/fixture.ps1" -DatabaseUrl $env:REHEARSAL_DATABASE_URL
    "schema=$(& "$PSScriptRoot/schema-fingerprint.ps1" -DatabaseUrl $env:REHEARSAL_DATABASE_URL)"
    "business=$(& "$PSScriptRoot/business-fingerprint.ps1" -DatabaseUrl $env:REHEARSAL_DATABASE_URL)"
}

Invoke-Scenario "upgrade" {
    $migrationCount = @(Get-ChildItem "$PWD/drizzle" -Filter "*.sql" -File).Count
    $split = [Math]::Max(1, [Math]::Floor($migrationCount / 2))
    & "$PSScriptRoot/migrate.ps1" -DatabaseUrl $env:REHEARSAL_UPGRADE_DATABASE_URL -Count $split
    & "$PSScriptRoot/migrate.ps1" -DatabaseUrl $env:REHEARSAL_UPGRADE_DATABASE_URL -StartAt $split
    & "$PSScriptRoot/fixture.ps1" -DatabaseUrl $env:REHEARSAL_UPGRADE_DATABASE_URL
    $clean = & "$PSScriptRoot/schema-fingerprint.ps1" -DatabaseUrl $env:REHEARSAL_DATABASE_URL
    $upgrade = & "$PSScriptRoot/schema-fingerprint.ps1" -DatabaseUrl $env:REHEARSAL_UPGRADE_DATABASE_URL
    if ($clean -ne $upgrade) { throw "FAIL: clean and upgrade schema fingerprints differ" }
    "schema=$upgrade"
}

Invoke-Scenario "backup-restore" {
    $backupFile = Join-Path $artifactRoot "synthetic-backup.sql"
    & "$PSScriptRoot/backup.ps1" -DatabaseUrl $env:REHEARSAL_DATABASE_URL -OutputFile $backupFile
    & "$PSScriptRoot/migrate.ps1" -DatabaseUrl $env:REHEARSAL_RESTORE_DATABASE_URL
    & "$PSScriptRoot/restore.ps1" -DatabaseUrl $env:REHEARSAL_RESTORE_DATABASE_URL -InputFile $backupFile
    $source = & "$PSScriptRoot/business-fingerprint.ps1" -DatabaseUrl $env:REHEARSAL_DATABASE_URL
    $restored = & "$PSScriptRoot/business-fingerprint.ps1" -DatabaseUrl $env:REHEARSAL_RESTORE_DATABASE_URL
    if ($source -ne $restored) { throw "FAIL: restored business fingerprint differs" }
    "business=$restored"
}

Invoke-Scenario "idempotency" {
    $before = & "$PSScriptRoot/schema-fingerprint.ps1" -DatabaseUrl $env:REHEARSAL_DATABASE_URL
    & "$PSScriptRoot/migrate.ps1" -DatabaseUrl $env:REHEARSAL_DATABASE_URL
    & "$PSScriptRoot/fixture.ps1" -DatabaseUrl $env:REHEARSAL_DATABASE_URL
    $after = & "$PSScriptRoot/schema-fingerprint.ps1" -DatabaseUrl $env:REHEARSAL_DATABASE_URL
    if ($before -ne $after) { throw "FAIL: second migration changed schema fingerprint" }
    "schema=$after"
}

Invoke-Scenario "lock" { & "$PSScriptRoot/lock.ps1" -DatabaseUrl $env:REHEARSAL_LOCK_DATABASE_URL }

$summary = [pscustomobject]@{
    version = 1
    generatedAt = [DateTime]::UtcNow.ToString("o")
    repository = $env:GITHUB_REPOSITORY
    commit = $env:GITHUB_SHA
    results = $results
}
Write-RehearsalArtifact -Path (Join-Path $artifactRoot "summary.json") -Value $summary
$results | ForEach-Object { Write-Host "$($_.status): $($_.scenario)" }
if (@($results | Where-Object status -ne "PASS").Count -gt 0) { exit 1 }
