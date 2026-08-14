param([Parameter(Mandatory = $true)][string]$DatabaseUrl)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"

foreach ($command in @("mysql", "mysqldump", "node", "pnpm")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "BLOCKED: required command is unavailable: $command"
    }
}

$fixture = Join-Path $PSScriptRoot "../../deploy/rehearsal/fixture/synthetic.sql"
if (-not (Test-Path -LiteralPath $fixture)) { throw "BLOCKED: deterministic synthetic fixture is missing" }
if ((Get-Item -LiteralPath $fixture).Length -eq 0) { throw "BLOCKED: synthetic fixture is empty" }

$version = Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query "SELECT VERSION();" -Raw
if ($version -notmatch '^8\.') { throw "BLOCKED: MySQL 8 is required; found $version" }
Write-Host "PASS: preflight (MySQL $version)"
