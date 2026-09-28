<#
  pokemon-site launcher -- shared logic for start.bat / dev.bat / stop.bat.

  Why this file exists:
  on this machine Node.js is NOT on the system PATH -- the only runtime is the one
  bundled with WorkBuddy (C:\Users\<user>\.workbuddy\binaries\node\versions\<ver>),
  and WorkBuddy only injects it into its own shells. So a plain cmd window that runs
  "npm start" fails immediately. This script locates a usable node, frees the port,
  optionally builds, then starts the server in the foreground.

  usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\launch.ps1 prod
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\launch.ps1 dev
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\launch.ps1 stop

  options:
    -Port <n>      default 3000
    -NoBrowser     do not open a browser window
    -NoPause       never wait for a keypress on error (used by tests)

  ASCII only on purpose: PowerShell 5.1 reads BOM-less .ps1 as ANSI, so non-ASCII
  text here would be garbled. Keep messages in English.
#>
[CmdletBinding()]
param(
  [ValidateSet('prod', 'dev', 'stop')]
  [string]$Mode = 'prod',
  [int]$Port = 3000,
  [switch]$NoBrowser,
  [switch]$NoPause
)

$ErrorActionPreference = 'Stop'

function Say {
  param([string]$Text, [string]$Color = 'Gray')
  Write-Host $Text -ForegroundColor $Color
}

function Stop-WithPause {
  param([int]$Code)
  if (-not $NoPause) {
    Write-Host ''
    Write-Host 'press any key to close this window ...' -ForegroundColor DarkGray
    try { $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') } catch { Start-Sleep -Seconds 5 }
  }
  exit $Code
}

# ---------------------------------------------------------------------------
# locate a usable node directory
# ---------------------------------------------------------------------------
function Resolve-NodeDir {
  # 1. a system-wide node always wins
  $cmd = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd -and $cmd.Source) {
    $dir = Split-Path -Parent $cmd.Source
    if ($dir -and (Test-Path (Join-Path $dir 'node.exe'))) { return $dir }
  }

  # 2. WorkBuddy's bundled node -- via the stable "current" pointer
  $versions = Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions'
  if (Test-Path $versions) {
    $pointer = Join-Path $versions 'current'
    if (Test-Path $pointer) {
      $name = ''
      try { $name = (Get-Content $pointer -Raw -ErrorAction Stop).Trim() } catch { $name = '' }
      if ($name) {
        $cand = Join-Path $versions $name
        if (Test-Path (Join-Path $cand 'node.exe')) { return $cand }
      }
    }

    # 3. fall back to the newest version directory
    $dirs = @(Get-ChildItem $versions -Directory -ErrorAction SilentlyContinue |
              Where-Object { Test-Path (Join-Path $_.FullName 'node.exe') } |
              Sort-Object Name -Descending)
    if ($dirs.Count -gt 0) { return $dirs[0].FullName }
  }

  return $null
}

# ---------------------------------------------------------------------------
# free the port, whoever is holding it
# ---------------------------------------------------------------------------
function Clear-Port {
  param([int]$P)
  $conns = @(Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction SilentlyContinue)
  if ($conns.Count -eq 0) { return $false }
  foreach ($procId in @($conns | Select-Object -ExpandProperty OwningProcess -Unique)) {
    Say ("[warn] port {0} is held by PID {1} - stopping it" -f $P, $procId) 'Yellow'
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 1500
  return $true
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if ($Mode -eq 'stop') {
  Say ("stopping whatever listens on port {0} ..." -f $Port)
  if (Clear-Port -P $Port) {
    Say ("done - port {0} is now free" -f $Port) 'Green'
    Stop-WithPause 0
  }
  Say ("nothing was listening on port {0} - already stopped" -f $Port) 'DarkGray'
  Stop-WithPause 0
}

Say '============================================================'
Say ("  pokemon-site  |  {0} launcher" -f $(if ($Mode -eq 'dev') { 'development' } else { 'production' }))
Say '============================================================'
Say ''

$nodeDir = Resolve-NodeDir
if (-not $nodeDir) {
  Say '[ERROR] Node.js not found.' 'Red'
  Say ''
  Say ("  checked the system PATH and {0}" -f (Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions'))
  Say '  install Node.js 22.5 or newer (node:sqlite needs 22.5+), then re-run.'
  Stop-WithPause 1
}

$env:PATH = "$nodeDir;$env:PATH"
$nodeExe = Join-Path $nodeDir 'node.exe'
$verRaw = (& $nodeExe -v).Trim()
$ver = $verRaw.TrimStart('v')

Say ("[ok] node {0}" -f $verRaw) 'Green'
Say ("[ok] node dir: {0}" -f $nodeDir) 'DarkGray'

# node:sqlite became available without a flag in Node 22.5.
# compare major/minor as INTEGERS -- casting "22.22" to a double would be 22.22
# and would wrongly look older than 22.5.
$parts = @($ver -split '[.\-+]')
$major = 0
$minor = 0
if ($parts.Count -ge 1) { [void][int]::TryParse($parts[0], [ref]$major) }
if ($parts.Count -ge 2) { [void][int]::TryParse($parts[1], [ref]$minor) }
if ($major -lt 22 -or ($major -eq 22 -and $minor -lt 5)) {
  Say ''
  Say ("[WARN] node {0} is older than 22.5 - the pokedex API uses the built-in node:sqlite module" -f $ver) 'Yellow'
  Say '       it will fail at runtime. please use Node 22.5 or newer.' 'Yellow'
  Say ''
}

Say ''
if (Clear-Port -P $Port) { Say '' }
Say ("[ok] port {0} is free" -f $Port) 'Green'
Say ''

# ---- build on demand (production only) ------------------------------------
if ($Mode -eq 'prod') {
  $built = (Test-Path (Join-Path $root '.next\BUILD_ID')) -and (Test-Path (Join-Path $root '.next\server'))
  if (-not $built) {
    Say '[1/2] no production build found - running "npm run build" (takes about a minute) ...' 'Yellow'
    Say ''
    & npm run build
    if ($LASTEXITCODE -ne 0) {
      Say ''
      Say '[ERROR] "npm run build" failed - see the output above.' 'Red'
      Stop-WithPause 1
    }
    Say ''
  }
}

Say ("[start] {0} on http://localhost:{1}" -f $(if ($Mode -eq 'dev') { 'next dev' } else { 'next start' }), $Port) 'Green'
Say '        stop: close this window, press Ctrl+C, or run stop.bat'
Say ''

# the browser needs a beat to launch; next boots in about a second
if (-not $NoBrowser) {
  try { Start-Process ("http://localhost:{0}" -f $Port) | Out-Null } catch { }
}

$env:PORT = "$Port"

# node:sqlite is still flagged experimental, so node prints
#   "(node:NNNN) ExperimentalWarning: SQLite is an experimental feature ..."
# to stderr the first time the pokedex API touches the database. That message is
# harmless, but it made the launcher's exit code depend on how the caller wired
# stderr: a wrapper that merges streams (powershell ... *>&1) turns it into a
# NativeCommandError, and with $ErrorActionPreference = 'Stop' that aborts the
# launcher and takes the running server down with it.
# So: silence the warning in the child, and never let a child error terminate us.
$env:NODE_NO_WARNINGS = '1'

$previousEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  if ($Mode -eq 'dev') {
    & npm run dev
  } else {
    & npm start
  }
} finally {
  $code = $LASTEXITCODE
  $ErrorActionPreference = $previousEap
}

Say ''
Say ("server stopped (exit {0})" -f $code) 'DarkGray'
Stop-WithPause 0
