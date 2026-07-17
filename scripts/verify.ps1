$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$jdk17 = "C:\Program Files\Java\jdk-17"

if (Test-Path $jdk17) {
  $env:JAVA_HOME = $jdk17
  $env:Path = "$env:JAVA_HOME\bin;$env:Path"
}

$mavenRepo = $env:MAVEN_REPO_LOCAL
if (-not $mavenRepo) {
  $mavenRepo = "E:\dev-cache\maven\repository"
}

if (-not $env:npm_config_cache) {
  $env:npm_config_cache = "E:\dev-cache\npm"
}

Push-Location $repoRoot
try {
  npm.cmd test
  npm.cmd audit --audit-level=moderate
  npm.cmd run typecheck
  npm.cmd run lint
  npm.cmd run build
  mvn.cmd "-Dmaven.repo.local=$mavenRepo" -f backend/pom.xml clean verify

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
