$ErrorActionPreference = "Stop"

$ports = @(3000, 8080)
foreach ($port in $ports) {
  Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object {
      if ($_ -and $_ -ne 0) {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
      }
    }
}

Push-Location (Join-Path $PSScriptRoot "..")
try {
  docker compose stop postgres
} finally {
  Pop-Location
}

Write-Host "Stopped frontend/backend processes on ports 3000/8080 and Docker Postgres."
