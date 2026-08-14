param([string[]]$DatabaseUrls = @($env:REHEARSAL_DATABASE_URL))

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"

if ($env:REHEARSAL_ENV -ne "1") { throw "BLOCKED: REHEARSAL_ENV must equal 1" }
if (-not $DatabaseUrls -or $DatabaseUrls.Count -eq 0) { throw "BLOCKED: no rehearsal database URL supplied" }

foreach ($databaseUrl in $DatabaseUrls) {
    if ([string]::IsNullOrWhiteSpace($databaseUrl)) { throw "BLOCKED: empty database URL" }
    $connection = Get-RehearsalConnection $databaseUrl
    if ($connection.Host -notin @("127.0.0.1", "localhost")) {
        throw "BLOCKED: database host must be local ephemeral MySQL"
    }
    if ($connection.Database -notmatch '^spios_rehearsal_[a-z0-9_]+$') {
        throw "BLOCKED: database name must start with spios_rehearsal_"
    }
    if ($connection.User -in @("root", "admin")) {
        throw "BLOCKED: privileged database users are forbidden"
    }
}

Write-Host "PASS: rehearsal environment guard"
