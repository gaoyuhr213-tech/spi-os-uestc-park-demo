Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RehearsalConnection {
    param([Parameter(Mandatory = $true)][string]$DatabaseUrl)

    $uri = [System.Uri]$DatabaseUrl
    if ($uri.Scheme -ne "mysql") { throw "Only mysql:// rehearsal URLs are allowed" }
    $userInfo = [System.Uri]::UnescapeDataString($uri.UserInfo).Split(':', 2)
    if ($userInfo.Count -ne 2) { throw "Database URL must contain user and password" }
    [pscustomobject]@{
        Host = $uri.Host
        Port = if ($uri.Port -gt 0) { $uri.Port } else { 3306 }
        User = $userInfo[0]
        Password = $userInfo[1]
        Database = $uri.AbsolutePath.TrimStart('/')
    }
}

function Invoke-RehearsalMysql {
    param(
        [Parameter(Mandatory = $true)][string]$DatabaseUrl,
        [string]$Query,
        [string]$SourceFile,
        [switch]$Raw
    )

    $connection = Get-RehearsalConnection $DatabaseUrl
    $previousPassword = $env:MYSQL_PWD
    $env:MYSQL_PWD = $connection.Password
    try {
        $arguments = @(
            "--protocol=TCP", "--host=$($connection.Host)",
            "--port=$($connection.Port)", "--user=$($connection.User)",
            "--database=$($connection.Database)", "--batch", "--skip-column-names"
        )
        if ($Query) {
            $output = & mysql @arguments "--execute=$Query" 2>&1
        } elseif ($SourceFile) {
            $resolved = (Resolve-Path -LiteralPath $SourceFile).Path.Replace('\', '/')
            $output = & mysql @arguments "--execute=source $resolved" 2>&1
        } else {
            throw "Query or SourceFile is required"
        }
        if ($LASTEXITCODE -ne 0) { throw "mysql failed: $($output -join [Environment]::NewLine)" }
        if ($Raw) { return ($output -join "`n").Trim() }
        return $output
    } finally {
        $env:MYSQL_PWD = $previousPassword
    }
}

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Write-RehearsalArtifact {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Value
    )
    $parent = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    $Value | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $Path -Encoding utf8
}
