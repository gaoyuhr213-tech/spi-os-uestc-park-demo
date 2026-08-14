param(
    [Parameter(Mandatory = $true)][string]$DatabaseUrl,
    [Parameter(Mandatory = $true)][string]$ArtifactPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"

$connection = Get-RehearsalConnection $DatabaseUrl
$mysqlPath = (Get-Command mysql -ErrorAction Stop).Source
$started = [DateTime]::UtcNow
$observation = [ordered]@{
    scenario = "lock"
    startedAt = $started.ToString("o")
    holderObserved = $false
    holderConnectionId = $null
    waitMilliseconds = 0
    contenderRaw = $null
    holderStdout = $null
    holderStderr = $null
    holderExitCode = $null
    holderState = $null
    reacquireRaw = $null
    releaseRaw = $null
    status = "FAIL"
}

$holder = Start-Job -ScriptBlock {
    param($Executable, $HostName, $Port, $User, $Password, $Database)
    $env:MYSQL_PWD = $Password
    $stdout = @()
    $stderr = @()
    try {
        $arguments = @(
            "--protocol=TCP", "--host=$HostName", "--port=$Port", "--user=$User",
            "--database=$Database", "--batch", "--skip-column-names",
            "--execute=SELECT GET_LOCK('spios_migration_rehearsal', 5); DO SLEEP(8); SELECT RELEASE_LOCK('spios_migration_rehearsal');"
        )
        $stdout = & $Executable @arguments 2>&1
        $exitCode = $LASTEXITCODE
    } catch {
        $stderr = @($_.Exception.Message)
        $exitCode = 1
    } finally {
        Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
    }
    [pscustomobject]@{ stdout=@($stdout | ForEach-Object { "$_" }); stderr=@($stderr); exitCode=$exitCode }
} -ArgumentList $mysqlPath, $connection.Host, $connection.Port, $connection.User, $connection.Password, $connection.Database

try {
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
        Start-Sleep -Milliseconds 250
        $usedBy = Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query "SELECT IS_USED_LOCK('spios_migration_rehearsal');" -Raw
        $observation.waitMilliseconds = [int]([DateTime]::UtcNow - $started).TotalMilliseconds
        if ($usedBy -and $usedBy -ne "NULL") {
            $observation.holderObserved = $true
            $observation.holderConnectionId = $usedBy
            break
        }
        if ($holder.State -in @("Completed", "Failed", "Stopped")) { break }
    } while ([DateTime]::UtcNow -lt $deadline)

    if (-not $observation.holderObserved) {
        throw "FAIL: holder did not acquire the migration lock before timeout"
    }

    $observation.contenderRaw = Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query "SELECT GET_LOCK('spios_migration_rehearsal', 0);" -Raw
    if ([string]$observation.contenderRaw -ne "0") {
        throw "FAIL: concurrent migration lock was not denied"
    }

    Wait-Job -Job $holder -Timeout 15 | Out-Null
    if ($holder.State -ne "Completed") { throw "FAIL: lock holder did not exit" }
    $holderResult = Receive-Job -Job $holder
    $observation.holderStdout = @($holderResult.stdout)
    $observation.holderStderr = @($holderResult.stderr)
    $observation.holderExitCode = $holderResult.exitCode
    if ([int]$observation.holderExitCode -ne 0) { throw "FAIL: lock holder mysql process failed" }

    $postRelease = @(Invoke-RehearsalMysql -DatabaseUrl $DatabaseUrl -Query "SELECT GET_LOCK('spios_migration_rehearsal', 2); SELECT RELEASE_LOCK('spios_migration_rehearsal');")
    $observation.reacquireRaw = if ($postRelease.Count -gt 0) { "$($postRelease[0])" } else { "" }
    $observation.releaseRaw = if ($postRelease.Count -gt 1) { "$($postRelease[1])" } else { "" }
    if ($observation.reacquireRaw -ne "1" -or $observation.releaseRaw -ne "1") {
        throw "FAIL: lock was not reacquired and released after holder exit"
    }

    $observation.status = "PASS"
} catch {
    $observation["error"] = $_.Exception.Message
    throw
} finally {
    if ($holder.State -notin @("Completed", "Failed", "Stopped")) { Stop-Job -Job $holder -ErrorAction SilentlyContinue }
    $observation.holderState = "$($holder.State)"
    if ($null -eq $observation.holderExitCode -and $holder.State -eq "Completed") {
        $holderResult = Receive-Job -Job $holder -ErrorAction SilentlyContinue
        if ($holderResult) {
            $observation.holderStdout = @($holderResult.stdout)
            $observation.holderStderr = @($holderResult.stderr)
            $observation.holderExitCode = $holderResult.exitCode
        }
    }
    $observation["finishedAt"] = [DateTime]::UtcNow.ToString("o")
    Write-RehearsalArtifact -Path $ArtifactPath -Value $observation
    Remove-Job -Job $holder -Force -ErrorAction SilentlyContinue
}

Write-Output ([pscustomobject]$observation)
