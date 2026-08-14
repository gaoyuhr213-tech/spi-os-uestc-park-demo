param([Parameter(Mandatory = $true)][string]$DatabaseUrl)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"

$query = @"
SELECT CONCAT(TABLE_NAME,'|',COLUMN_NAME,'|',ORDINAL_POSITION,'|',COLUMN_TYPE,'|',IS_NULLABLE,'|',COALESCE(COLUMN_DEFAULT,'<NULL>'))
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME <> '__spios_rehearsal_migrations'
ORDER BY TABLE_NAME, ORDINAL_POSITION;
"@
$canonical = Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query $query -Raw
$bytes = [Text.Encoding]::UTF8.GetBytes($canonical)
$hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
Write-Output $hash
