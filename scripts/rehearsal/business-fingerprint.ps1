param([Parameter(Mandatory = $true)][string]$DatabaseUrl)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"

$connection = Get-RehearsalConnection $DatabaseUrl
$tables = @("entities", "enrichments", "lifecycleEvents", "taskCompletions", "opsLedger", "graphNodes", "graphEdges", "parseHistory", "decisions", "resources", "connectors", "ingestionJobs", "mergeDecisions", "consents", "accessPolicies", "workflowDefs", "workflowInstances", "workflowTasks", "dataSources", "ingestionBatches", "evidenceRecords", "dataConflicts", "entityAliases", "sourceFieldPolicies", "decisionEvidenceLinks", "industryRuleTodos", "scoreModels", "ruleConfigs")
$temporaryPath = Join-Path ([System.IO.Path]::GetTempPath()) ("spios-business-fingerprint-" + [guid]::NewGuid().ToString("N") + ".sql")
$previousPassword = $env:MYSQL_PWD
$env:MYSQL_PWD = $connection.Password
try {
    & mysqldump --protocol=TCP "--host=$($connection.Host)" "--port=$($connection.Port)" "--user=$($connection.User)" --no-create-info --skip-triggers --no-tablespaces --skip-comments --skip-dump-date --skip-set-charset --compact $connection.Database @tables | Set-Content -LiteralPath $temporaryPath -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "FAIL: business fingerprint dump failed" }
    Write-Output (Get-Sha256 $temporaryPath)
} finally {
    $env:MYSQL_PWD = $previousPassword
    if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath -Force }
}
