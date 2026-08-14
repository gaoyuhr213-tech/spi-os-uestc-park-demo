param(
    [Parameter(Mandatory = $true)][string]$DatabaseUrl,
    [int]$StartAt = 0,
    [int]$Count = 0,
    [string]$MigrationRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"

if ([string]::IsNullOrWhiteSpace($MigrationRoot)) {
    $MigrationRoot = Join-Path $PSScriptRoot "../../drizzle"
}
$resolvedMigrationRoot = Resolve-Path -LiteralPath $MigrationRoot
$files = @(Get-ChildItem -LiteralPath $resolvedMigrationRoot -File -Filter "*.sql" | Sort-Object Name)
if ($files.Count -eq 0) { throw "BLOCKED: no drizzle SQL migrations found" }
if ($StartAt -lt 0 -or $StartAt -gt $files.Count) { throw "Invalid StartAt" }
$selected = @($files | Select-Object -Skip $StartAt)
if ($Count -gt 0) { $selected = @($selected | Select-Object -First $Count) }

Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query @"
CREATE TABLE IF NOT EXISTS __spios_rehearsal_migrations (
  path varchar(255) NOT NULL PRIMARY KEY,
  checksum char(64) NOT NULL,
  applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"@ | Out-Null

foreach ($file in $selected) {
    $checksum = Get-Sha256 $file.FullName
    $safeName = $file.Name.Replace("'", "''")
    $record = Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query "SELECT checksum FROM __spios_rehearsal_migrations WHERE path='$safeName';" -Raw
    if ($record) {
        if ($record -ne $checksum) { throw "FAIL: checksum drift for $($file.Name)" }
        Write-Host "NOOP: $($file.Name) already applied"
        continue
    }

    $sql = Get-Content -LiteralPath $file.FullName -Raw -Encoding utf8
    $statements = @($sql -split '\s*-->\s*statement-breakpoint\s*')
    foreach ($statement in $statements) {
        if (-not [string]::IsNullOrWhiteSpace($statement)) {
            Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query $statement | Out-Null
        }
    }
    Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query "INSERT INTO __spios_rehearsal_migrations(path, checksum) VALUES ('$safeName', '$checksum');" | Out-Null
    Write-Host "APPLIED: $($file.Name)"
}
