param(
    [Parameter(Mandatory = $true)][string]$DatabaseUrl,
    [Parameter(Mandatory = $true)][string]$InputFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"

if (-not (Test-Path -LiteralPath $InputFile)) { throw "BLOCKED: backup file is missing" }
Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -SourceFile $InputFile | Out-Null
$count = Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query "SELECT COUNT(*) FROM entities WHERE tenantId='rehearsal';" -Raw
if ([int]$count -ne 2) { throw "FAIL: restore row count mismatch ($count)" }
Write-Host "PASS: logical restore"
