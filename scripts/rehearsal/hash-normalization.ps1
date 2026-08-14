param(
    [Parameter(Mandatory = $true)][string]$ArtifactPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot/common.ps1"

$parent = Split-Path -Parent $ArtifactPath
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$lfPath = Join-Path $parent "line-ending-lf.bin"
$crlfPath = Join-Path $parent "line-ending-crlf.bin"
try {
    # Chinese bytes prove that the hash routine never round-trips source files through a text decoder.
    [System.IO.File]::WriteAllBytes($lfPath, [System.Text.Encoding]::UTF8.GetBytes("schema`n中文字段`nfixture`n"))
    [System.IO.File]::WriteAllBytes($crlfPath, [System.Text.Encoding]::UTF8.GetBytes("schema`r`n中文字段`r`nfixture`r`n"))
    $lfHash = Get-Sha256 -Path $lfPath
    $crlfHash = Get-Sha256 -Path $crlfPath
    if ($lfHash -ne $crlfHash) { throw "FAIL: LF and CRLF canonical hashes differ" }
    Write-RehearsalArtifact -Path $ArtifactPath -Value ([pscustomobject]@{
        status = "PASS"
        lfHash = $lfHash
        crlfHash = $crlfHash
        bytePreserving = $true
    })
    Write-Host "PASS: line ending normalization"
} finally {
    Remove-Item -LiteralPath $lfPath, $crlfPath -Force -ErrorAction SilentlyContinue
}
