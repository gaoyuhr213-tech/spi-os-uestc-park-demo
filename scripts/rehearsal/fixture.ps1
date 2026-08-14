param([Parameter(Mandatory = $true)][string]$DatabaseUrl)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"

$fixture = Join-Path $PSScriptRoot "../../deploy/rehearsal/fixture/production-like-synthetic.sql"
if (-not (Test-Path -LiteralPath $fixture)) { throw "BLOCKED: production-like synthetic fixture is missing" }
Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -SourceFile $fixture | Out-Null
$shape = Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query @"
SELECT COUNT(*),
       SUM(tenantId='rehearsal-park-a'),
       SUM(tenantId='rehearsal-park-b'),
       SUM(dataEnvironment='production')
FROM entities
WHERE testRunId='migration-rehearsal-prodlike-v2';
"@ -Raw
$parts = $shape -split "`t"
if ($parts.Count -ne 4 -or [int]$parts[0] -ne 69 -or [int]$parts[1] -ne 35 -or [int]$parts[2] -ne 34 -or [int]$parts[3] -ne 0) {
    throw "FAIL: production-like entity fixture shape invalid: $shape"
}
$sharedNameCount = Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query "SELECT COUNT(*) FROM entities WHERE testRunId='migration-rehearsal-prodlike-v2' AND name='Synthetic Shared Enterprise';" -Raw
if ([int]$sharedNameCount -ne 2) { throw "FAIL: dual-tenant shared business-key coverage missing" }
$coverage = Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query @"
SELECT
  (SELECT COUNT(*) FROM enrichments WHERE tenantId IN ('rehearsal-park-a','rehearsal-park-b')),
  (SELECT COUNT(*) FROM evidenceRecords WHERE tenantId IN ('rehearsal-park-a','rehearsal-park-b')),
  (SELECT COUNT(*) FROM decisions WHERE tenantId IN ('rehearsal-park-a','rehearsal-park-b')),
  (SELECT COUNT(*) FROM workflowInstances WHERE tenantId IN ('rehearsal-park-a','rehearsal-park-b')),
  (SELECT COUNT(*) FROM resources WHERE tenantId IN ('rehearsal-park-a','rehearsal-park-b')),
  (SELECT COUNT(*) FROM industryRuleTodos WHERE tenantId IN ('rehearsal-park-a','rehearsal-park-b')),
  (SELECT COUNT(*) FROM graphEdges WHERE tenantId IN ('rehearsal-park-a','rehearsal-park-b')),
  (SELECT COUNT(*) FROM connectors WHERE tenantId IN ('rehearsal-park-a','rehearsal-park-b')),
  (SELECT COUNT(*) FROM dataSources WHERE tenantId IN ('rehearsal-park-a','rehearsal-park-b'));
"@ -Raw
$coverageParts = $coverage -split "`t"
if ($coverageParts.Count -ne 9 -or (@($coverageParts | Where-Object { [int]$_ -le 0 }).Count -gt 0)) {
    throw "FAIL: full-domain fixture coverage is incomplete: $coverage"
}
Write-Host "PASS: deterministic production-like fixture (69 entities, dual tenant, full-domain coverage)"
