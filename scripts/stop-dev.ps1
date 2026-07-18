$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$stateDir = Join-Path $repoRoot ".dev"
. (Join-Path $PSScriptRoot "dev-lifecycle.ps1")

Stop-ProjectManagedProcess -StateDir $stateDir -Name "frontend" -ScriptPath (Join-Path $PSScriptRoot "frontend-dev.ps1") | Out-Null
Stop-ProjectManagedProcess -StateDir $stateDir -Name "backend" -ScriptPath (Join-Path $PSScriptRoot "backend-dev.ps1") | Out-Null

if (Get-Command docker -ErrorAction SilentlyContinue) {
  Push-Location $repoRoot
  try {
    docker compose stop postgres
    if ($LASTEXITCODE -ne 0) {
      throw "Could not stop this project's Docker Postgres service."
    }
  } finally {
    Pop-Location
  }
} else {
  Write-Warning "Docker is unavailable; no Docker-managed database was stopped."
}

Write-Host "Stopped this project's managed frontend, backend, and Docker Postgres services."
