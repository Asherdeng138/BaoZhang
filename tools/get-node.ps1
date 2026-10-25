# Downloads portable Node.js into .tools\node (official nodejs.org build, SHA-256 checked).
# Nothing is installed system-wide and no environment variables are changed permanently.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent $PSScriptRoot
$tools = Join-Path $root '.tools'
$target = Join-Path $tools 'node'
if (Test-Path (Join-Path $target 'node.exe')) { exit 0 }
$version = 'v22.12.0'
$name = "node-$version-win-x64"
$base = "https://nodejs.org/dist/$version/"
$zip = Join-Path $tools "$name.zip"
Invoke-WebRequest -UseBasicParsing -Uri ($base + "$name.zip") -OutFile $zip -TimeoutSec 900
$sums = (Invoke-WebRequest -UseBasicParsing -Uri ($base + 'SHASUMS256.txt')).Content
if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
$line = ($sums -split "`n") | Where-Object { $_ -match [regex]::Escape("$name.zip") } | Select-Object -First 1
if (-not $line) { throw 'Node checksum not found' }
$expected = ($line.Trim() -split '\s+')[0].ToUpper()
$actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
if ($actual -ne $expected) { Remove-Item $zip; throw "Node download checksum mismatch" }
Expand-Archive -LiteralPath $zip -DestinationPath $tools -Force
Rename-Item -LiteralPath (Join-Path $tools $name) -NewName 'node'
Remove-Item $zip
