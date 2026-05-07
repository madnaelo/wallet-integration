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
  npm run typecheck
  mvn "-Dmaven.repo.local=$mavenRepo" -f backend/pom.xml test
} finally {
  Pop-Location
}
