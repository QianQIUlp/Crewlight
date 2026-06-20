$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$Package = Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json
$Version = $Package.version
$Artifact = "agentpulse-v$Version-windows-x64"
$Archive = Join-Path $Root "release\$Artifact.zip"
$Checksum = "$Archive.sha256"
$Port = if ($env:AGENTPULSE_SMOKE_PORT) { $env:AGENTPULSE_SMOKE_PORT } else { "43768" }
$Work = Join-Path ([System.IO.Path]::GetTempPath()) "AgentPulse smoke $([guid]::NewGuid())"
$Extracted = Join-Path $Work $Artifact
$Bin = Join-Path $Extracted "agentpulse.exe"
$HomeDir = Join-Path $Work "home"
$DaemonOut = Join-Path $Work "daemon.stdout.log"
$DaemonErr = Join-Path $Work "daemon.stderr.log"
$DaemonPidFile = Join-Path $Work "daemon.pid"
$DaemonPid = $null
$NodeHarness = (Get-Command node -ErrorAction Stop).Source
$Taskkill = (Get-Command taskkill.exe -ErrorAction Stop).Source
$Where = (Get-Command where.exe -ErrorAction Stop).Source
$DaemonControl = Join-Path $Root "scripts\windows-daemon-control.mjs"

function Convert-StreamToText {
  param([object]$Value)

  if ($null -eq $Value) {
    return [string]""
  }

  if ($Value -is [array]) {
    $lines = @($Value | ForEach-Object { [string]$_ })
    return [string]($lines -join [Environment]::NewLine)
  }

  return [string]$Value
}

function Invoke-AgentPulse {
  param(
    [string[]]$Arguments,
    [string]$Stdin,
    [switch]$AllowFailure
  )

  $stdoutPath = Join-Path $Work "command-$([guid]::NewGuid()).stdout"
  $stderrPath = Join-Path $Work "command-$([guid]::NewGuid()).stderr"
  $stdinFile = $null
  $start = @{
    FilePath = $Bin
    ArgumentList = $Arguments
    RedirectStandardOutput = $stdoutPath
    RedirectStandardError = $stderrPath
    NoNewWindow = $true
    PassThru = $true
    Wait = $true
  }
  if ($PSBoundParameters.ContainsKey("Stdin")) {
    $stdinFile = Join-Path $Work "command-$([guid]::NewGuid()).stdin"
    [System.IO.File]::WriteAllText($stdinFile, $Stdin, [System.Text.UTF8Encoding]::new($false))
    $start.RedirectStandardInput = $stdinFile
  }

  $process = Start-Process @start
  $stdoutValue = if (Test-Path $stdoutPath) { Get-Content $stdoutPath -Raw } else { $null }
  $stderrValue = if (Test-Path $stderrPath) { Get-Content $stderrPath -Raw } else { $null }
  $stdoutText = [string](Convert-StreamToText -Value $stdoutValue)
  $stderrText = [string](Convert-StreamToText -Value $stderrValue)
  $result = [pscustomobject]@{
    ExitCode = $process.ExitCode
    Stdout = [string]$stdoutText
    Stderr = [string]$stderrText
  }
  if (-not $AllowFailure -and $result.ExitCode -ne 0) {
    throw "agentpulse $($Arguments -join ' ') failed with $($result.ExitCode): $stderrText"
  }
  return $result
}

function Wait-Dashboard {
  param([int]$Attempts = 100)

  for ($i = 0; $i -lt $Attempts; $i++) {
    try {
      return Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/dashboard" -TimeoutSec 1
    } catch {
      Start-Sleep -Milliseconds 100
    }
  }
  throw "Dashboard did not become ready."
}

function ConvertFrom-FirstJsonObject {
  param(
    [string]$Text,
    [string]$Description
  )

  $start = -1
  $depth = 0
  $inString = $false
  $escaped = $false

  for ($i = 0; $i -lt $Text.Length; $i++) {
    $character = $Text[$i]

    if ($start -lt 0) {
      if ($character -eq "{") {
        $start = $i
        $depth = 1
      }
      continue
    }

    if ($inString) {
      if ($escaped) {
        $escaped = $false
      } elseif ($character -eq "\") {
        $escaped = $true
      } elseif ($character -eq '"') {
        $inString = $false
      }
      continue
    }

    if ($character -eq '"') {
      $inString = $true
    } elseif ($character -eq "{") {
      $depth++
    } elseif ($character -eq "}") {
      $depth--
      if ($depth -eq 0) {
        $json = $Text.Substring($start, $i - $start + 1)
        try {
          return $json | ConvertFrom-Json
        } catch {
          throw "$Description first JSON object could not be parsed. Expected binary path: $Bin"
        }
      }
    }
  }

  throw "$Description did not contain a complete JSON object. Expected binary path: $Bin"
}

function Get-StopHookCommand {
  param(
    [object]$Parsed,
    [string]$FieldName
  )

  $path = "hooks.Stop[0].hooks[0].$FieldName"
  $hooksProperty = $Parsed.PSObject.Properties["hooks"]
  if ($null -eq $hooksProperty -or $null -eq $hooksProperty.Value) {
    throw "$path missing. Expected binary path: $Bin"
  }

  $stopProperty = $hooksProperty.Value.PSObject.Properties["Stop"]
  if ($null -eq $stopProperty -or $null -eq $stopProperty.Value) {
    throw "$path missing. Expected binary path: $Bin"
  }

  $stopGroups = @($stopProperty.Value)
  if ($stopGroups.Count -lt 1 -or $null -eq $stopGroups[0]) {
    throw "$path missing. Expected binary path: $Bin"
  }

  $handlersProperty = $stopGroups[0].PSObject.Properties["hooks"]
  if ($null -eq $handlersProperty -or $null -eq $handlersProperty.Value) {
    throw "$path missing. Expected binary path: $Bin"
  }

  $handlers = @($handlersProperty.Value)
  if ($handlers.Count -lt 1 -or $null -eq $handlers[0]) {
    throw "$path missing. Expected binary path: $Bin"
  }

  $commandProperty = $handlers[0].PSObject.Properties[$FieldName]
  if ($null -eq $commandProperty -or $null -eq $commandProperty.Value) {
    throw "$path missing. Expected binary path: $Bin"
  }
  if (-not ($commandProperty.Value -is [string])) {
    throw "$path must be a string. Expected binary path: $Bin"
  }

  return $commandProperty.Value
}

function Assert-SetupCommand {
  param(
    [string]$Command,
    [string]$Description,
    [string]$IngestTarget
  )

  $comparison = [System.StringComparison]::OrdinalIgnoreCase
  if ($Command.IndexOf($Bin, $comparison) -lt 0 -or
      $Command.IndexOf("ingest", $comparison) -lt 0 -or
      $Command.IndexOf($IngestTarget, $comparison) -lt 0) {
    throw "$Description command validation failed. Expected binary path: $Bin. Parsed command: $Command"
  }
}

function ConvertFrom-CodexNotify {
  param([string]$Text)

  $reader = [System.IO.StringReader]::new($Text)
  try {
    while (($line = $reader.ReadLine()) -ne $null) {
      $trimmedLine = $line.Trim()
      $equalsIndex = $trimmedLine.IndexOf("=")
      if ($equalsIndex -lt 0) {
        continue
      }

      $key = $trimmedLine.Substring(0, $equalsIndex).Trim()
      if (-not $key.Equals("notify", [System.StringComparison]::Ordinal)) {
        continue
      }

      $arrayText = $trimmedLine.Substring($equalsIndex + 1).Trim()
      try {
        return @($arrayText | ConvertFrom-Json)
      } catch {
        throw "Codex notify argv could not be parsed. Expected binary path: $Bin"
      }
    }
  } finally {
    $reader.Dispose()
  }

  throw "Codex notify output did not contain a notify = [...] line. Expected binary path: $Bin"
}

function Stop-Daemon {
  if ($null -eq $script:DaemonPid) {
    return
  }

  & $NodeHarness $DaemonControl stop $DaemonPidFile
  if ($LASTEXITCODE -ne 0) {
    & $Taskkill /PID $script:DaemonPid /T /F | Out-Null
  }

  for ($i = 0; $i -lt 50; $i++) {
    if (-not (Get-Process -Id $script:DaemonPid -ErrorAction SilentlyContinue)) {
      $script:DaemonPid = $null
      return
    }
    Start-Sleep -Milliseconds 100
  }
  throw "Unable to terminate the daemon process tree."
}

function Start-Daemon {
  param(
    [string]$StdoutPath,
    [string]$StderrPath
  )

  Remove-Item $DaemonPidFile -ErrorAction SilentlyContinue
  & $NodeHarness $DaemonControl start $Bin $DaemonPidFile $StdoutPath $StderrPath `
    daemon --dashboard --port $Port --notifier none
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $DaemonPidFile)) {
    throw "Unable to start the standalone daemon process group."
  }
  $script:DaemonPid = [int](Get-Content $DaemonPidFile -Raw)
}

try {
  New-Item -ItemType Directory -Path $Work, $HomeDir -Force | Out-Null

  $checksumText = (Get-Content $Checksum -Raw).Trim()
  $expected = ($checksumText -split "\s+")[0].ToLowerInvariant()
  $actual = (Get-FileHash -Algorithm SHA256 $Archive).Hash.ToLowerInvariant()
  if ($actual -ne $expected) {
    throw "Windows archive checksum mismatch."
  }

  Expand-Archive -Path $Archive -DestinationPath $Extracted
  foreach ($name in @("agentpulse.exe", "LICENSE", "BUILD-INFO.txt")) {
    if (-not (Test-Path (Join-Path $Extracted $name))) {
      throw "Archive is missing $name."
    }
  }
  $entries = @(Get-ChildItem $Extracted)
  if ($entries.Count -ne 3) {
    throw "Archive must contain exactly agentpulse.exe, LICENSE, and BUILD-INFO.txt."
  }

  $buildInfo = Get-Content (Join-Path $Extracted "BUILD-INFO.txt") -Raw
  if ($buildInfo -notmatch "AgentPulse version: $([regex]::Escape($Version))" -or
      $buildInfo -notmatch "Platform: windows" -or
      $buildInfo -notmatch "Architecture: x64") {
    throw "BUILD-INFO.txt does not describe the Windows x64 artifact."
  }

  $env:PATH = $Extracted
  $env:HOME = $HomeDir
  $env:USERPROFILE = $HomeDir
  $env:AGENTPULSE_PORT = $Port
  Remove-Item Env:AGENTPULSE_HOST -ErrorAction SilentlyContinue

  foreach ($name in @("node", "npm", "pnpm")) {
    $whereOut = Join-Path $Work "where-$name.stdout"
    $whereErr = Join-Path $Work "where-$name.stderr"
    $whereProcess = Start-Process -FilePath $Where `
      -ArgumentList @($name) `
      -RedirectStandardOutput $whereOut `
      -RedirectStandardError $whereErr `
      -NoNewWindow `
      -PassThru `
      -Wait
    if ($whereProcess.ExitCode -eq 0) {
      throw "Unexpected runtime dependency available in restricted PATH: $name"
    }
  }

  $help = Invoke-AgentPulse -Arguments @("--help")
  if ($help.Stdout -notmatch "AgentPulse v$([regex]::Escape($Version))") {
    throw "Help output has the wrong version."
  }

  $claude = Invoke-AgentPulse -Arguments @("setup", "claude-code", "--print")
  $claudeSetup = ConvertFrom-FirstJsonObject -Text $claude.Stdout -Description "Claude setup"
  $claudeCommand = Get-StopHookCommand -Parsed $claudeSetup -FieldName "command"
  Assert-SetupCommand -Command $claudeCommand -Description "Claude setup" -IngestTarget "claude-code"

  $codex = Invoke-AgentPulse -Arguments @("setup", "codex", "--print")
  $codexArgv = @(ConvertFrom-CodexNotify -Text $codex.Stdout)
  $codexArgvDebug = $codexArgv | ConvertTo-Json -Compress
  if ($codexArgv.Count -ne 3 -or
      -not ($codexArgv[0] -is [string]) -or
      -not ($codexArgv[1] -is [string]) -or
      -not ($codexArgv[2] -is [string])) {
    throw "Codex notify argv must contain exactly three strings. Expected binary path: $Bin. Parsed argv: $codexArgvDebug"
  }
  if (-not $codexArgv[0].Equals($Bin, [System.StringComparison]::OrdinalIgnoreCase) -or
      $codexArgv[1] -cne "ingest" -or
      $codexArgv[2] -cne "codex") {
    throw "Codex notify argv validation failed. Expected binary path: $Bin. Parsed argv: $codexArgvDebug"
  }

  $codexHooks = Invoke-AgentPulse -Arguments @("setup", "codex-hooks", "--print")
  $codexHooksSetup = ConvertFrom-FirstJsonObject -Text $codexHooks.Stdout -Description "Codex hooks setup"
  $codexHooksCommand = Get-StopHookCommand -Parsed $codexHooksSetup -FieldName "commandWindows"
  Assert-SetupCommand -Command $codexHooksCommand -Description "Codex hooks setup" -IngestTarget "codex-hook"

  $env:AGENTPULSE_HOST = "0.0.0.0"
  $unsafe = Invoke-AgentPulse -Arguments @("daemon", "--dashboard", "--notifier", "none") -AllowFailure
  if ($unsafe.ExitCode -eq 0 -or $unsafe.Stderr -notmatch "requires --host 127.0.0.1 or --host ::1") {
    throw "Dashboard did not reject AGENTPULSE_HOST=0.0.0.0."
  }
  Remove-Item Env:AGENTPULSE_HOST

  Start-Daemon -StdoutPath $DaemonOut -StderrPath $DaemonErr

  $dashboard = Wait-Dashboard
  if ($dashboard.Content -notmatch "AgentPulse Dashboard") {
    throw "Dashboard HTML was not served."
  }
  $dashboardApi = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/dashboard/api"
  if ($dashboardApi.health.status -ne "ok") {
    throw "Dashboard API health is not ok."
  }

  $doctor = Invoke-AgentPulse -Arguments @("doctor", "--json", "--notifier", "none")
  if (-not ($doctor.Stdout | ConvertFrom-Json).ok) {
    throw "Doctor did not pass against the standalone daemon."
  }

  $hookPayload = '{"session_id":"windows-codex-hook","cwd":"C:\\demo","hook_event_name":"Stop","prompt":"must-not-leak","tool_input":{"command":"must-not-leak"},"tool_response":"must-not-leak","transcript_path":"C:\\must-not-leak"}'
  $hook = Invoke-AgentPulse -Arguments @("ingest", "codex-hook") -Stdin $hookPayload
  $hookStdout = [string](Convert-StreamToText -Value $hook.Stdout)
  $hookStderr = [string](Convert-StreamToText -Value $hook.Stderr)
  $hookResponse = $hookStdout | ConvertFrom-Json
  $hookResponseProperties = @($hookResponse.PSObject.Properties)
  if ($hookStderr.Length -ne 0 -or
      $hookStdout.Contains("must-not-leak") -or
      $hookResponseProperties.Count -ne 1 -or
      $hookResponseProperties[0].Name -cne "continue" -or
      $hookResponse.continue -ne $true) {
    throw "Codex hook ingest did not return the expected no-op JSON."
  }

  Invoke-AgentPulse -Arguments @(
    "emit", "--source", "custom", "--surface", "manual", "--status", "completed",
    "--session-id", "windows-standalone-smoke", "--message", "done"
  ) | Out-Null
  $status = Invoke-AgentPulse -Arguments @("status", "--json")
  $sessions = @($status.Stdout | ConvertFrom-Json)
  $hookSessions = @($sessions | Where-Object { $_.sessionId -ceq "windows-codex-hook" })
  $manualSessions = @($sessions | Where-Object { $_.sessionId -ceq "windows-standalone-smoke" })
  if ($hookSessions.Count -ne 1 -or
      $hookSessions[0].status -cne "completed" -or
      $manualSessions.Count -ne 1 -or
      $status.Stdout -match "must-not-leak") {
    throw "Status output is missing smoke sessions or leaked sensitive hook data."
  }

  Stop-Daemon

  $RestartOut = Join-Path $Work "restart.stdout.log"
  $RestartErr = Join-Path $Work "restart.stderr.log"
  Start-Daemon -StdoutPath $RestartOut -StderrPath $RestartErr
  Wait-Dashboard | Out-Null
  Stop-Daemon

  Write-Output "Windows standalone smoke test passed with restricted PATH=$Extracted"
} finally {
  Stop-Daemon
  Remove-Item $Work -Recurse -Force -ErrorAction SilentlyContinue
}
