$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$jdk17 = "C:\Program Files\Java\jdk-17"

function Import-LocalEnvFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    $separatorIndex = $trimmed.IndexOf("=")
    if ($separatorIndex -le 0) {
      continue
    }

    $key = $trimmed.Substring(0, $separatorIndex).Trim()
    $value = $trimmed.Substring($separatorIndex + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    if (-not [Environment]::GetEnvironmentVariable($key, "Process")) {
      Set-Item -Path "Env:$key" -Value $value
    }
  }
}

Import-LocalEnvFile (Join-Path $repoRoot ".env.development")

if (Test-Path $jdk17) {
  $env:JAVA_HOME = $jdk17
  $env:Path = "$env:JAVA_HOME\bin;$env:Path"
}

$mavenRepo = $env:MAVEN_REPO_LOCAL
if (-not $mavenRepo) {
  $mavenRepo = "E:\dev-cache\maven\repository"
}

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "jdbc:postgresql://localhost:55433/wallet"
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
