param([switch]$NoBuild)

# Build + restart the NestJS API on port 3001.
# Usage: .\deploy-api.ps1 [-NoBuild]

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$conns = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 3001 }
foreach ($c in $conns) {
  Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 1

if (-not $NoBuild) {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "API build failed" }
}

New-Item -ItemType Directory -Path (Join-Path $root "logs") -Force | Out-Null
Start-Process -FilePath "node" -ArgumentList "dist/src/main.js" -WorkingDirectory $root -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $root "logs\api.out.log") `
  -RedirectStandardError (Join-Path $root "logs\api.err.log")

Start-Sleep -Seconds 3
Write-Output "API started on port 3001 (build: $(-not $NoBuild))"
