param([Parameter(Mandatory = $true)][string]$DatabaseUrl)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"

$canonical = Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query @"
SELECT CONCAT(eid,'|',name,'|',dataEnvironment,'|',COALESCE(testRunId,''))
FROM entities WHERE tenantId='rehearsal' ORDER BY eid;
"@ -Raw
$bytes = [Text.Encoding]::UTF8.GetBytes($canonical)
$hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
Write-Output $hash
