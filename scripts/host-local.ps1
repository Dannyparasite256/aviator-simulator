# Host Aviator with Docker Compose
# Prerequisites: Docker Desktop running
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/host-local.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host ""
  Write-Host "Docker is not installed or not in PATH." -ForegroundColor Red
  Write-Host "1. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  Write-Host "2. Restart your PC"
  Write-Host "3. Open Docker Desktop, wait until it is Running"
  Write-Host "4. Run this script again"
  Write-Host ""
  Write-Host "Full guide: DEPLOY.md"
  exit 1
}

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example — edit secrets before production!" -ForegroundColor Yellow
}

Write-Host "Building and starting stack..." -ForegroundColor Cyan
docker compose up -d --build

Write-Host ""
Write-Host "Aviator is starting." -ForegroundColor Green
Write-Host "  Web:  http://localhost:3000"
Write-Host "  API:  http://localhost:4000/api/health"
Write-Host "  Docs: http://localhost:4000/api/docs"
Write-Host ""
Write-Host "Demo logins:"
Write-Host "  player@aviator.local / Player123!"
Write-Host "  admin@aviator.local  / Admin123!"
Write-Host ""
Write-Host "Logs: docker compose logs -f"
Write-Host "Stop: docker compose down"
