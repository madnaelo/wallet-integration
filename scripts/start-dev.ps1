[CmdletBinding()]
param(
  [switch]$SkipInstall,
  [int]$DockerTimeoutSeconds = 180,
  [int]$PostgresTimeoutSeconds = 90,
  [int]$BackendTimeoutSeconds = 150,
  [int]$FrontendTimeoutSeconds = 150
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$logDir = Join-Path $repoRoot "logs\dev"
$stateDir = Join-Path $repoRoot ".dev"
$backendHealthUrl = "http://localhost:8080/api/health"
$frontendUrl = "http://localhost:3000"
$script:composeKind = $null

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-IsWindows {
  return [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
}

function Get-RequiredCommand {
  param([string]$Name)
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Missing required command '$Name'. Install it, reopen PowerShell, and run this script again."
  }
  return $command
}

function Invoke-Checked {
  param(
    [scriptblock]$Command,
    [string]$Description
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE."
  }
}

function Test-TcpPort {
  param(
    [string]$HostName,
    [int]$Port,
    [int]$TimeoutMs = 700
  )

  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $asyncResult = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $asyncResult.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      return $false
    }
    $client.EndConnect($asyncResult)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Test-HttpReady {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Test-BackendReady {
  try {
    $response = Invoke-RestMethod -Uri $backendHealthUrl -TimeoutSec 3
    return $response.status -eq "ok"
  } catch {
    return $false
  }
}

function Wait-ForService {
  param(
    [string]$Name,
    [scriptblock]$Ready,
    [int]$TimeoutSeconds,
    [System.Diagnostics.Process]$Process = $null,
    [string]$LogHint = ""
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (& $Ready) {
      Write-Host "$Name is ready."
      return
    }

    if ($Process -and $Process.HasExited) {
      $hint = if ($LogHint) { " Check $LogHint." } else { "" }
      throw "$Name exited before it became ready.$hint"
    }

    Start-Sleep -Seconds 2
  }

  $timeoutHint = if ($LogHint) { " Check $LogHint." } else { "" }
  throw "Timed out waiting for $Name.$timeoutHint"
}

function Initialize-ProjectCaches {
  $hasEDrive = Test-Path "E:\"

  if (-not $env:npm_config_cache) {
    if ($hasEDrive) {
      $env:npm_config_cache = "E:\dev-cache\npm"
    } elseif ($env:LOCALAPPDATA) {
      $env:npm_config_cache = Join-Path $env:LOCALAPPDATA "npm-cache"
    } else {
      $env:npm_config_cache = Join-Path $HOME ".cache\npm"
    }
  }

  if (-not $env:MAVEN_REPO_LOCAL) {
    if ($hasEDrive) {
      $env:MAVEN_REPO_LOCAL = "E:\dev-cache\maven\repository"
    } else {
      $env:MAVEN_REPO_LOCAL = Join-Path $HOME ".m2\repository"
    }
  }

  New-Item -ItemType Directory -Force -Path $env:npm_config_cache | Out-Null
  New-Item -ItemType Directory -Force -Path $env:MAVEN_REPO_LOCAL | Out-Null
}

function Initialize-Java {
  $jdk17 = "C:\Program Files\Java\jdk-17"
  if ((Test-IsWindows) -and (Test-Path $jdk17)) {
    $env:JAVA_HOME = $jdk17
    $env:Path = "$env:JAVA_HOME\bin;$env:Path"
  }

  Get-RequiredCommand "java" | Out-Null
  Get-RequiredCommand "mvn" | Out-Null
}

function Ensure-LocalEnvFile {
  $localEnv = Join-Path $repoRoot ".env.development"
  $exampleEnv = Join-Path $repoRoot ".env.example"

  if ((Test-Path $localEnv) -or -not (Test-Path $exampleEnv)) {
    return
  }

  Copy-Item -LiteralPath $exampleEnv -Destination $localEnv
  Write-Warning "Created .env.development from .env.example. Add real WalletConnect/provider keys when needed."
}

function Test-DockerDaemon {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    return $false
  }

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & docker info *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

function Start-DockerDesktop {
  if (-not (Test-IsWindows)) {
    throw "Docker daemon is not running. Start Docker on this machine and run the script again."
  }

  $candidates = @()
  if ($env:ProgramFiles) {
    $candidates += (Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe")
  }
  if (${env:ProgramFiles(x86)}) {
    $candidates += (Join-Path ${env:ProgramFiles(x86)} "Docker\Docker\Docker Desktop.exe")
  }
  if ($env:LOCALAPPDATA) {
    $candidates += (Join-Path $env:LOCALAPPDATA "Programs\Docker\Docker\Docker Desktop.exe")
  }

  $dockerDesktop = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $dockerDesktop) {
    throw "Docker daemon is not running and Docker Desktop was not found. Start Docker manually or install Docker Desktop."
  }

  Write-Host "Starting Docker Desktop..."
  Start-Process -FilePath $dockerDesktop -WindowStyle Hidden | Out-Null

  Wait-ForService `
    -Name "Docker daemon" `
    -Ready { Test-DockerDaemon } `
    -TimeoutSeconds $DockerTimeoutSeconds `
    -LogHint "Docker Desktop status"
}

function Initialize-DockerCompose {
  Get-RequiredCommand "docker" | Out-Null

  & docker compose version > $null 2> $null
  if ($LASTEXITCODE -eq 0) {
    $script:composeKind = "plugin"
    return
  }

  if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    $script:composeKind = "standalone"
    return
  }

  throw "Docker Compose is not available. Install the Docker Compose plugin or docker-compose."
}

function Invoke-DockerCompose {
  param([string[]]$Arguments)

  Push-Location $repoRoot
  try {
    if ($script:composeKind -eq "plugin") {
      & docker compose @Arguments
    } else {
      & docker-compose @Arguments
    }

    if ($LASTEXITCODE -ne 0) {
      throw "Docker Compose command failed: $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function Get-PostgresContainerId {
  Push-Location $repoRoot
  try {
    if ($script:composeKind -eq "plugin") {
      return (& docker compose ps -q postgres 2> $null)
    }
    return (& docker-compose ps -q postgres 2> $null)
  } finally {
    Pop-Location
  }
}

function Test-PostgresContainerHealthy {
  $containerId = Get-PostgresContainerId
  if (-not $containerId) {
    return $false
  }

  $status = (& docker inspect --format "{{.State.Health.Status}}" $containerId 2> $null)
  return $LASTEXITCODE -eq 0 -and $status.Trim() -eq "healthy"
}

function Ensure-Database {
  Write-Step "Starting database"

  $dockerAvailable = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $dockerAvailable) {
    if (Test-TcpPort -HostName "localhost" -Port 55432) {
      Write-Warning "Docker CLI not found; using existing PostgreSQL on localhost:55432."
      return
    }
    throw "Docker CLI is not installed and PostgreSQL is not reachable on localhost:55432."
  }

  if (-not (Test-DockerDaemon)) {
    try {
      Start-DockerDesktop
    } catch {
      if (Test-TcpPort -HostName "localhost" -Port 55432) {
        Write-Warning "$($_.Exception.Message) Using existing PostgreSQL on localhost:55432."
        return
      }
      throw
    }
  }

  Initialize-DockerCompose
  Invoke-DockerCompose -Arguments @("up", "-d", "postgres")
  Wait-ForService `
    -Name "PostgreSQL" `
    -Ready { Test-PostgresContainerHealthy } `
    -TimeoutSeconds $PostgresTimeoutSeconds `
    -LogHint "docker compose logs postgres"
}

function Install-FrontendDependencies {
  Get-RequiredCommand "node" | Out-Null
  $npmExe = Get-NpmExecutable

  if ($SkipInstall) {
    Write-Host "Skipping frontend dependency install."
    return
  }

  $nodeModules = Join-Path $repoRoot "node_modules"
  $lockFile = Join-Path $repoRoot "package-lock.json"
  $installedLock = Join-Path $nodeModules ".package-lock.json"
  $shouldInstall = -not (Test-Path $nodeModules) -or -not (Test-Path $installedLock)

  if (-not $shouldInstall -and (Test-Path $lockFile)) {
    $shouldInstall = (Get-Item $lockFile).LastWriteTimeUtc -gt (Get-Item $installedLock).LastWriteTimeUtc
  }

  if (-not $shouldInstall) {
    Write-Host "Frontend dependencies are already installed."
    return
  }

  Write-Step "Installing frontend dependencies"
  Push-Location $repoRoot
  try {
    Invoke-Checked { & $npmExe ci } "npm ci"
  } finally {
    Pop-Location
  }
}

function Install-BackendDependencies {
  Initialize-Java

  if ($SkipInstall) {
    Write-Host "Skipping backend dependency download."
    return
  }

  Write-Step "Preparing backend dependencies"
  Push-Location $repoRoot
  try {
    Invoke-Checked {
      mvn "-Dmaven.repo.local=$env:MAVEN_REPO_LOCAL" -f backend/pom.xml -DskipTests dependency:go-offline
    } "Maven dependency download"
  } finally {
    Pop-Location
  }
}

function Get-PowerShellExecutable {
  $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
  if ($pwsh) {
    return $pwsh.Source
  }
  return (Get-RequiredCommand "powershell").Source
}

function Get-NpmExecutable {
  if (Test-IsWindows) {
    $npmCmd = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
    if ($npmCmd) {
      return $npmCmd.Source
    }
  }

  return (Get-RequiredCommand "npm").Source
}

function Start-ManagedScript {
  param(
    [string]$Name,
    [string]$ScriptPath,
    [scriptblock]$Ready,
    [int]$TimeoutSeconds
  )

  if (& $Ready) {
    Write-Host "$Name is already running."
    return
  }

  $powershellExe = Get-PowerShellExecutable
  $stdoutLog = Join-Path $logDir "$Name.out.log"
  $stderrLog = Join-Path $logDir "$Name.err.log"
  $pidFile = Join-Path $stateDir "$Name.pid"

  Remove-Item -LiteralPath $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue

  $startParams = @{
    FilePath = $powershellExe
    ArgumentList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ScriptPath)
    WorkingDirectory = $repoRoot
    RedirectStandardOutput = $stdoutLog
    RedirectStandardError = $stderrLog
    PassThru = $true
  }
  if (Test-IsWindows) {
    $startParams.WindowStyle = "Hidden"
  }

  Write-Host "Starting $Name..."
  $process = Start-Process @startParams
  Set-Content -Path $pidFile -Value $process.Id

  Wait-ForService `
    -Name $Name `
    -Ready $Ready `
    -TimeoutSeconds $TimeoutSeconds `
    -Process $process `
    -LogHint "$stdoutLog and $stderrLog"
}

Write-Step "Preparing local environment"
Initialize-ProjectCaches
Ensure-LocalEnvFile
Write-Host "npm cache: $env:npm_config_cache"
Write-Host "Maven repo: $env:MAVEN_REPO_LOCAL"

Install-FrontendDependencies
Install-BackendDependencies
Ensure-Database

Write-Step "Starting backend"
Start-ManagedScript `
  -Name "backend" `
  -ScriptPath (Join-Path $PSScriptRoot "backend-dev.ps1") `
  -Ready { Test-BackendReady } `
  -TimeoutSeconds $BackendTimeoutSeconds

Write-Step "Starting frontend"
Start-ManagedScript `
  -Name "frontend" `
  -ScriptPath (Join-Path $PSScriptRoot "frontend-dev.ps1") `
  -Ready { Test-HttpReady $frontendUrl } `
  -TimeoutSeconds $FrontendTimeoutSeconds

Write-Host ""
Write-Host "Development stack is ready." -ForegroundColor Green
Write-Host "Frontend: $frontendUrl"
Write-Host "Backend:  $backendHealthUrl"
Write-Host "Database: localhost:55432 (wallet / wallet / wallet)"
Write-Host "Logs:     $logDir"
Write-Host "Stop:     powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\stop-dev.ps1'"
