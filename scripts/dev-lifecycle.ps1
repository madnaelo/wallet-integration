function Get-ProjectProcessCommandLine {
  param([int]$ProcessId)

  if ($IsWindows -or [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if ($process) {
      return [string]$process.CommandLine
    }
    return ""
  }

  $procCommandLine = "/proc/$ProcessId/cmdline"
  if (Test-Path -LiteralPath $procCommandLine -PathType Leaf) {
    return (Get-Content -LiteralPath $procCommandLine -Raw -ErrorAction SilentlyContinue).Replace([char]0, [char]32)
  }

  if (Get-Command ps -ErrorAction SilentlyContinue) {
    return [string](& ps -p $ProcessId -o command= 2> $null)
  }

  return ""
}

function Get-ProjectManagedProcessId {
  param(
    [string]$StateDir,
    [string]$Name,
    [string]$ScriptPath
  )

  $pidFile = Join-Path $StateDir "$Name.pid"
  if (-not (Test-Path -LiteralPath $pidFile -PathType Leaf)) {
    return 0
  }

  $parsedProcessId = 0
  $rawProcessId = (Get-Content -LiteralPath $pidFile -Raw -ErrorAction SilentlyContinue).Trim()
  if (-not [int]::TryParse($rawProcessId, [ref]$parsedProcessId) -or $parsedProcessId -le 0) {
    return 0
  }

  if (-not (Get-Process -Id $parsedProcessId -ErrorAction SilentlyContinue)) {
    return 0
  }

  $expectedScript = (Resolve-Path -LiteralPath $ScriptPath).Path.Replace([char]92, [char]47).ToLowerInvariant()
  $commandLine = (Get-ProjectProcessCommandLine -ProcessId $parsedProcessId).Replace([char]92, [char]47).ToLowerInvariant()
  if (-not $commandLine.Contains($expectedScript)) {
    return 0
  }

  return $parsedProcessId
}

function Stop-ProjectProcessTree {
  param([int]$ProcessId)

  if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
    return $false
  }

  $childProcessIds = @()
  if ($IsWindows -or [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT) {
    $childProcessIds = @(
      Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty ProcessId
    )
  } elseif (Get-Command pgrep -ErrorAction SilentlyContinue) {
    $childProcessIds = @(& pgrep -P $ProcessId 2> $null)
  }

  foreach ($childProcessIdValue in $childProcessIds) {
    $childProcessId = 0
    if ([int]::TryParse([string]$childProcessIdValue, [ref]$childProcessId)) {
      Stop-ProjectProcessTree -ProcessId $childProcessId | Out-Null
    }
  }

  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  try {
    Wait-Process -Id $ProcessId -Timeout 15 -ErrorAction SilentlyContinue
  } catch {
    # The process may have already exited.
  }
  return $true
}

function Stop-ProjectManagedProcess {
  param(
    [string]$StateDir,
    [string]$Name,
    [string]$ScriptPath
  )

  $pidFile = Join-Path $StateDir "$Name.pid"
  $processId = Get-ProjectManagedProcessId -StateDir $StateDir -Name $Name -ScriptPath $ScriptPath
  if ($processId -gt 0) {
    Write-Host "Stopping project-owned $Name process $processId..."
    Stop-ProjectProcessTree -ProcessId $processId | Out-Null
  } elseif (Test-Path -LiteralPath $pidFile -PathType Leaf) {
    Write-Warning "Ignored stale or unverified $Name PID file; no external process was stopped."
  }

  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  return $processId -gt 0
}
