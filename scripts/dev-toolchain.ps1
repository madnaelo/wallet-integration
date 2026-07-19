function Test-ProjectWindows {
  return $IsWindows -or [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
}

function Get-ProjectCacheRoot {
  param([string]$RepoRoot)

  if ($env:DEV_CACHE_ROOT) {
    return [System.IO.Path]::GetFullPath($env:DEV_CACHE_ROOT)
  }

  if (Test-ProjectWindows) {
    $repoDrive = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($RepoRoot))
    if ($repoDrive -and $repoDrive -notlike 'C:*') {
      return Join-Path $repoDrive 'dev-cache'
    }
    if (Test-Path -LiteralPath 'E:\') {
      return 'E:\dev-cache'
    }
    if ($env:LOCALAPPDATA) {
      return Join-Path $env:LOCALAPPDATA 'SwapAssistant\dev-cache'
    }
  }

  if ($env:XDG_CACHE_HOME) {
    return Join-Path $env:XDG_CACHE_HOME 'swap-assistant'
  }
  if ($HOME) {
    return Join-Path $HOME '.cache/swap-assistant'
  }

  return Join-Path $RepoRoot '.dev/cache'
}

function Initialize-ProjectDependencyCaches {
  param([string]$RepoRoot)

  $cacheRoot = Get-ProjectCacheRoot -RepoRoot $RepoRoot
  if (-not $env:npm_config_cache) {
    $env:npm_config_cache = Join-Path $cacheRoot 'npm'
  }
  if (-not $env:MAVEN_REPO_LOCAL) {
    $env:MAVEN_REPO_LOCAL = Join-Path $cacheRoot 'maven/repository'
  }
  if (-not $env:PLAYWRIGHT_BROWSERS_PATH) {
    $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $cacheRoot 'playwright'
  }

  New-Item -ItemType Directory -Force -Path $env:npm_config_cache | Out-Null
  New-Item -ItemType Directory -Force -Path $env:MAVEN_REPO_LOCAL | Out-Null
  New-Item -ItemType Directory -Force -Path $env:PLAYWRIGHT_BROWSERS_PATH | Out-Null
}

function Get-ProjectJavaMajorVersion {
  param([string]$JavaExecutable)

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $versionOutput = (& $JavaExecutable -version 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) {
      return 0
    }
  } catch {
    return 0
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  $match = [regex]::Match($versionOutput, '(\d+)(?:\.(\d+))?')
  if (-not $match.Success) {
    return 0
  }

  $major = [int]$match.Groups[1].Value
  if ($major -eq 1 -and $match.Groups[2].Success) {
    return [int]$match.Groups[2].Value
  }
  return $major
}

function Initialize-ProjectJava17 {
  $javaHomes = [System.Collections.Generic.List[string]]::new()
  if ($env:JAVA_HOME) {
    $javaHomes.Add($env:JAVA_HOME)
  }

  if (Test-ProjectWindows) {
    if ($env:ProgramFiles) {
      $preferredJdk = Join-Path $env:ProgramFiles 'Java\jdk-17'
      if (Test-Path -LiteralPath $preferredJdk -PathType Container) {
        $javaHomes.Add($preferredJdk)
      }
      $javaParent = Join-Path $env:ProgramFiles 'Java'
      if (Test-Path -LiteralPath $javaParent -PathType Container) {
        Get-ChildItem -LiteralPath $javaParent -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue |
          ForEach-Object { $javaHomes.Add($_.FullName) }
      }
    }
  } else {
    @(
      '/usr/lib/jvm/java-17-openjdk-amd64',
      '/usr/lib/jvm/java-17-openjdk',
      '/opt/java/openjdk'
    ) | Where-Object { Test-Path -LiteralPath $_ -PathType Container } |
      ForEach-Object { $javaHomes.Add($_) }
  }

  foreach ($javaHome in ($javaHomes | Select-Object -Unique)) {
    $javaName = if (Test-ProjectWindows) { 'java.exe' } else { 'java' }
    $javaExecutable = Join-Path (Join-Path $javaHome 'bin') $javaName
    if ((Test-Path -LiteralPath $javaExecutable -PathType Leaf) -and
        (Get-ProjectJavaMajorVersion -JavaExecutable $javaExecutable) -eq 17) {
      $env:JAVA_HOME = $javaHome
      $env:Path = "$(Join-Path $javaHome 'bin')$([System.IO.Path]::PathSeparator)$env:Path"
      return
    }
  }

  $pathJava = Get-Command java -ErrorAction SilentlyContinue
  if ($pathJava -and (Get-ProjectJavaMajorVersion -JavaExecutable $pathJava.Source) -eq 17) {
    return
  }

  throw 'Java 17 is required. Set JAVA_HOME to a JDK 17 installation and run this script again.'
}

function Assert-ProjectNodeVersion {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    throw 'Node.js is required. Install Node.js 22, 23, or 24 and run this script again.'
  }

  $version = [string](& $node.Source --version)
  $match = [regex]::Match($version, '^v?(\d+)')
  if (-not $match.Success) {
    throw "Could not determine the installed Node.js version: $version"
  }

  $major = [int]$match.Groups[1].Value
  if ($major -lt 22 -or $major -ge 25) {
    throw "Node.js $version is unsupported. Use Node.js 22, 23, or 24."
  }
}

function Get-ProjectMavenExecutable {
  $names = if (Test-ProjectWindows) { @('mvn.cmd', 'mvn') } else { @('mvn') }
  foreach ($name in $names) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }

  throw 'Apache Maven 3.9 or newer is required and was not found on PATH.'
}

function Get-ProjectNpmExecutable {
  $names = if (Test-ProjectWindows) { @('npm.cmd', 'npm') } else { @('npm') }
  foreach ($name in $names) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }

  throw 'npm was not found on PATH.'
}
