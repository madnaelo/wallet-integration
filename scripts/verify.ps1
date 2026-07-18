$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
. (Join-Path $PSScriptRoot "dev-toolchain.ps1")

Initialize-ProjectDependencyCaches -RepoRoot $repoRoot
Initialize-ProjectJava17
Assert-ProjectNodeVersion
$mavenExe = Get-ProjectMavenExecutable
$npmExe = Get-ProjectNpmExecutable

Push-Location $repoRoot
try {
  & $npmExe test
  & $npmExe audit --audit-level=moderate
  & $npmExe run typecheck
  & $npmExe run lint
  & $npmExe run build
  & $mavenExe "-Dmaven.repo.local=$env:MAVEN_REPO_LOCAL" -f backend/pom.xml clean verify

  if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker compose config --quiet
    docker compose --env-file infra/prod.env.example -f docker-compose.prod.yml config --quiet
    docker compose --env-file infra/oci-backend.env.example -f docker-compose.oci-backend.yml config --quiet
  } else {
    Write-Warning "Docker is unavailable; Compose validation was skipped."
  }
} finally {
  Pop-Location
}
