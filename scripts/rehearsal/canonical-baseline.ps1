param(
    [string]$DatabaseUrl = "",
    [string]$ArtifactPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"

$root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$contractPath = Join-Path $root "deploy/rehearsal/canonical-baseline.contract.json"
if (-not (Test-Path -LiteralPath $contractPath)) { throw "BLOCKED: canonical baseline contract is missing" }
$contract = Get-Content -LiteralPath $contractPath -Raw -Encoding utf8 | ConvertFrom-Json
$migrationRoot = Join-Path $root "drizzle"
$actualFiles = @(Get-ChildItem -LiteralPath $migrationRoot -File -Filter "*.sql" | Sort-Object Name)
$errors = @()

if ($actualFiles.Count -ne @($contract.migrationJournal).Count) {
    $errors += "migration count mismatch: expected $(@($contract.migrationJournal).Count), actual $($actualFiles.Count)"
}

foreach ($expected in @($contract.migrationJournal)) {
    $actual = @($actualFiles | Where-Object Name -eq $expected.path)
    if ($actual.Count -ne 1) {
        $errors += "missing or duplicate canonical migration: $($expected.path)"
        continue
    }
    $actualHash = Get-Sha256 $actual[0].FullName
    if ($actualHash -ne $expected.sha256) { $errors += "checksum drift: $($expected.path)" }
}

$schemaPath = Join-Path $migrationRoot "schema.ts"
if (-not (Test-Path -LiteralPath $schemaPath)) {
    $errors += "schema.ts is missing"
} elseif ((Get-Sha256 $schemaPath) -ne $contract.schemaSha256) {
    $errors += "schema.ts checksum drift"
}

$ledger = $null
if (-not [string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    & "$PSScriptRoot/guard.ps1" -DatabaseUrls @($DatabaseUrl) | Out-Null
    $ledgerRows = @(Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query "SELECT path, checksum FROM __spios_rehearsal_migrations ORDER BY path;" -Raw -split "`n" | Where-Object { $_ })
    if ($ledgerRows.Count -ne @($contract.migrationJournal).Count) {
        $errors += "rehearsal ledger count mismatch: expected $(@($contract.migrationJournal).Count), actual $($ledgerRows.Count)"
    }
    foreach ($expected in @($contract.migrationJournal)) {
        $expectedLedger = "$($expected.path)`t$($expected.sha256)"
        if ($ledgerRows -notcontains $expectedLedger) { $errors += "rehearsal ledger mismatch: $($expected.path)" }
    }
    $ledger = $ledgerRows
}

$result = [pscustomobject]@{
    schema = $contract.schema
    status = if ($errors.Count -eq 0) { "PASS" } else { "FAIL" }
    sourceAuthority = $contract.authority
    canonicalWorkspaceCommit = $contract.canonicalWorkspaceCommit
    sourceManifestHash = $contract.sourceManifestHash
    sourceFileCount = $contract.sourceFileCount
    schemaSha256 = $contract.schemaSha256
    migrationCount = @($contract.migrationJournal).Count
    actualMigrationCount = $actualFiles.Count
    databaseVerified = -not [string]::IsNullOrWhiteSpace($DatabaseUrl)
    rehearsalLedger = $ledger
    errors = $errors
}

if ($ArtifactPath) { Write-RehearsalArtifact -Path $ArtifactPath -Value $result }
if ($errors.Count -gt 0) { throw "FAIL: canonical baseline reconciliation failed: $($errors -join '; ')" }
Write-Host "PASS: canonical baseline reconciled"
