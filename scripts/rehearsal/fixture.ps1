param([Parameter(Mandatory = $true)][string]$DatabaseUrl)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"

$fixture = Join-Path $PSScriptRoot "../../deploy/rehearsal/fixture/synthetic.sql"
if (-not (Test-Path -LiteralPath $fixture)) { throw "BLOCKED: synthetic fixture is missing" }
Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -SourceFile $fixture | Out-Null
$count = Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query "SELECT COUNT(*) FROM entities WHERE tenantId='rehearsal' AND dataEnvironment='test' AND testRunId='migration-rehearsal-v1';" -Raw
if ([int]$count -ne 2) { throw "FAIL: expected 2 deterministic fixture rows, found $count" }
Write-Host "PASS: deterministic synthetic fixture"
