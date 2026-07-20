# Deploy Aviator to Railway (always online, PC can be off)
# Prerequisites: railway login, Docker optional (Railway builds in cloud)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$Railway = "npx --yes @railway/cli"

function Invoke-Railway([string[]]$Args) {
  & npx --yes @railway/cli @Args
  if ($LASTEXITCODE -ne 0) { throw "railway $($Args -join ' ') failed ($LASTEXITCODE)" }
}

Write-Host "Checking Railway auth..." -ForegroundColor Cyan
& npx --yes @railway/cli whoami
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged in. Opening browserless login..." -ForegroundColor Yellow
  & npx --yes @railway/cli login --browserless
  if ($LASTEXITCODE -ne 0) { throw "Railway login failed" }
}

Write-Host "Done. Use the interactive steps in DEPLOY.md or re-run after linking a project." -ForegroundColor Green
