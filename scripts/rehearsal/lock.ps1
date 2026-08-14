param([Parameter(Mandatory = $true)][string]$DatabaseUrl)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"

$connection = Get-RehearsalConnection $DatabaseUrl
$previousPassword = $env:MYSQL_PWD
$env:MYSQL_PWD = $connection.Password
$stdout = Join-Path ([IO.Path]::GetTempPath()) "spios-lock-out.txt"
$stderr = Join-Path ([IO.Path]::GetTempPath()) "spios-lock-err.txt"
$arguments = @(
    "--protocol=TCP", "--host=$($connection.Host)", "--port=$($connection.Port)",
    "--user=$($connection.User)", "--database=$($connection.Database)",
    "--batch", "--skip-column-names",
    "--execute=SELECT GET_LOCK('spios_migration_rehearsal', 5); DO SLEEP(6); SELECT RELEASE_LOCK('spios_migration_rehearsal');"
)
try {
    $holder = Start-Process -FilePath "mysql" -ArgumentList $arguments -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    Start-Sleep -Seconds 2
    $contended = Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query "SELECT GET_LOCK('spios_migration_rehearsal', 0);" -Raw
    if ($contended -ne "0") { throw "FAIL: concurrent migration lock was not denied" }
    $holder.WaitForExit()
    if ($holder.ExitCode -ne 0) { throw "FAIL: lock holder failed: $(Get-Content $stderr -Raw)" }
} finally {
    $env:MYSQL_PWD = $previousPassword
    Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
}
Write-Host "PASS: concurrent migration lock"
