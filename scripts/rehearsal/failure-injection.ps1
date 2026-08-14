param(
    [Parameter(Mandatory = $true)][string]$DatabaseUrl,
    [Parameter(Mandatory = $true)][string]$ArtifactPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"

$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) "spios-invalid-migration-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force -Path $fixtureRoot | Out-Null
$invalidMigration = Join-Path $fixtureRoot "9999_deliberate_failure.sql"
"CREATE TABL deliberate_failure (id int);" | Set-Content -LiteralPath $invalidMigration -Encoding utf8

$observation = [ordered]@{
    scenario = "failure-injection"
    injectedMigration = "9999_deliberate_failure.sql"
    expectedExit = "non-zero"
    actualExitCode = $null
    ledgerRows = $null
    stdout = @()
    status = "FAIL"
}

try {
    $output = & pwsh -NoProfile -File "$PSScriptRoot/migrate.ps1" -DatabaseUrl $DatabaseUrl -MigrationRoot $fixtureRoot 2>&1
    $observation.actualExitCode = $LASTEXITCODE
    $observation.stdout = @($output | ForEach-Object { "$_" })
    if ([int]$observation.actualExitCode -eq 0) { throw "FAIL: deliberately invalid migration returned zero" }

    $ledgerRows = Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query "SELECT COUNT(*) FROM __spios_rehearsal_migrations WHERE path='9999_deliberate_failure.sql';" -Raw
    $observation.ledgerRows = [int]$ledgerRows
    if ([int]$observation.ledgerRows -ne 0) { throw "FAIL: failed migration was recorded as applied" }

    $observation.status = "PASS"
} catch {
    $observation["error"] = $_.Exception.Message
    throw
} finally {
    Write-RehearsalArtifact -Path $ArtifactPath -Value $observation
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output ([pscustomobject]$observation)
