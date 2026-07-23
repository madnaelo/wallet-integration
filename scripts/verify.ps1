$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
. (Join-Path $PSScriptRoot "dev-toolchain.ps1")

Initialize-ProjectDependencyCaches -RepoRoot $repoRoot
Initialize-ProjectJava17
Assert-ProjectNodeVersion
$mavenExe = Get-ProjectMavenExecutable
$npmExe = Get-ProjectNpmExecutable

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$Description
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE."
  }
}

Push-Location $repoRoot
try {
  Invoke-CheckedCommand $npmExe @("test") "Frontend tests"
  Invoke-CheckedCommand $npmExe @("audit", "--audit-level=moderate") "Frontend dependency audit"
  Invoke-CheckedCommand $npmExe @("run", "typecheck") "Frontend type check"
  Invoke-CheckedCommand $npmExe @("run", "lint") "Frontend lint"
  Invoke-CheckedCommand $npmExe @("run", "build") "Frontend production build"
  Invoke-CheckedCommand $npmExe @("exec", "--", "playwright", "install", "--only-shell", "chromium") "Playwright browser setup"
  Invoke-CheckedCommand $npmExe @("run", "test:e2e") "Frontend browser tests"
  Invoke-CheckedCommand $mavenExe @(
    "-Dmaven.repo.local=$env:MAVEN_REPO_LOCAL",
    "-f",
    "backend/pom.xml",
    "clean",
    "verify"
  ) "Backend verification"

  if (Get-Command docker -ErrorAction SilentlyContinue) {
    $dockerExe = (Get-Command docker).Source
    Invoke-CheckedCommand $dockerExe @("compose", "config", "--quiet") "Local Compose validation"
    Invoke-CheckedCommand $dockerExe @(
      "compose",
      "--env-file",
      "infra/prod.env.example",
      "-f",
      "docker-compose.prod.yml",
      "config",
      "--quiet"
    ) "Production Compose validation"
    Invoke-CheckedCommand $dockerExe @(
      "compose",
      "--env-file",
      "infra/oci-backend.env.example",
      "-f",
      "docker-compose.oci-backend.yml",
      "config",
      "--quiet"
    ) "OCI Compose validation"
  } else {
    Write-Warning "Docker is unavailable; Compose validation was skipped."
  }
} finally {
  Pop-Location
}
