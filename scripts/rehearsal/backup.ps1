param(
    [Parameter(Mandatory = $true)][string]$DatabaseUrl,
    [Parameter(Mandatory = $true)][string]$OutputFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"

$connection = Get-RehearsalConnection $DatabaseUrl
$parent = Split-Path -Parent $OutputFile
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$previousPassword = $env:MYSQL_PWD
$env:MYSQL_PWD = $connection.Password
try {
    & mysqldump --protocol=TCP "--host=$($connection.Host)" "--port=$($connection.Port)" "--user=$($connection.User)" --single-transaction --no-create-info --skip-triggers --no-tablespaces $connection.Database entities opsLedger | Set-Content -LiteralPath $OutputFile -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "FAIL: mysqldump failed" }
} finally {
    $env:MYSQL_PWD = $previousPassword
}
if ((Get-Item -LiteralPath $OutputFile).Length -eq 0) { throw "FAIL: backup is empty" }
Write-Host "PASS: logical backup created"
