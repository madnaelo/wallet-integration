$ErrorActionPreference = "Stop"

Push-Location (Join-Path $PSScriptRoot "..")
try {
  if (-not $env:npm_config_cache) {
    $env:npm_config_cache = "E:\dev-cache\npm"
  }
  if (-not $env:NEXT_PUBLIC_BACKEND_BASE_URL) {
    $env:NEXT_PUBLIC_BACKEND_BASE_URL = "http://localhost:8080"
  }
  npm run dev
} finally {
  Pop-Location
}
