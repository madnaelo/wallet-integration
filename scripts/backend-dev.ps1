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

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "jdbc:postgresql://localhost:55432/wallet"
}
if (-not $env:DATABASE_USERNAME) {
  $env:DATABASE_USERNAME = "wallet"
}
if (-not $env:DATABASE_PASSWORD) {
  $env:DATABASE_PASSWORD = "wallet"
}
if (-not $env:CORS_ALLOWED_ORIGINS) {
  $env:CORS_ALLOWED_ORIGINS = "http://localhost:3000"
}

Push-Location (Join-Path $repoRoot "backend")
try {
  mvn "-Dmaven.repo.local=$mavenRepo" spring-boot:run
} finally {
  Pop-Location
}
