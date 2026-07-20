$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
. (Join-Path $PSScriptRoot "dev-toolchain.ps1")

Initialize-ProjectDependencyCaches -RepoRoot $repoRoot
Assert-ProjectNodeVersion
$npmExe = Get-ProjectNpmExecutable

Push-Location $repoRoot
try {
  if (-not $env:NEXT_PUBLIC_BACKEND_BASE_URL) {
    $env:NEXT_PUBLIC_BACKEND_BASE_URL = "http://localhost:18080"
  }
  & $npmExe run dev
} finally {
  Pop-Location
}
