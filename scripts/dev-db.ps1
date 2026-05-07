$ErrorActionPreference = "Stop"

Push-Location (Join-Path $PSScriptRoot "..")
try {
  docker compose up -d postgres
  Write-Host "Postgres is starting on localhost:55432 (database/user/password: wallet/wallet/wallet)."
} finally {
  Pop-Location
}
