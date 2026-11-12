param(
  [string]$Profile = "desktop",
  [switch]$NoLaunch,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Pause-IfNeeded {
  if (-not $NoPause) {
    Write-Host ""
    Read-Host "Press Enter to close"
  }
}

try {
  Write-Host ""
  Write-Host "EduEval Studio installer" -ForegroundColor Cyan
  Write-Host "Profile: $Profile"
  Write-Host ""

  $tgz = Get-ChildItem -LiteralPath $scriptDir -Filter "dsh-plugin-edueval-*.tgz" |
    Sort-Object Name -Descending |
    Select-Object -First 1
  if (-not $tgz) {
    throw "dsh-plugin-edueval-*.tgz was not found next to this script."
  }

  $dsh = $null
  $dshCommand = Get-Command dsh.cmd -ErrorAction SilentlyContinue
  if ($dshCommand) {
    $dsh = $dshCommand.Source
  }
  if (-not $dsh) {
    $candidates = @(
      (Join-Path $env:LOCALAPPDATA "Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"),
      (Join-Path $env:ProgramFiles "DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd")
    )
    foreach ($candidate in $candidates) {
      if ($candidate -and (Test-Path -LiteralPath $candidate)) {
        $dsh = $candidate
        break
      }
    }
  }
  if (-not $dsh) {
    throw "Could not find the DSH CLI (dsh.cmd). Install or repair DeepSeek Harness first."
  }

  Write-Host "Package: $($tgz.FullName)"
  Write-Host "DSH CLI: $dsh"
  Write-Host ""

  $running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -eq "DeepSeek Harness" })
  if ($running.Count -gt 0) {
    Write-Host "DeepSeek Harness is currently running." -ForegroundColor Yellow
    Write-Host "The plugin will be installed, but you must fully quit and reopen DSH to load it." -ForegroundColor Yellow
    Write-Host ""
  }

  & $dsh plugin --profile $Profile add $tgz.FullName
  if ($LASTEXITCODE -ne 0) {
    throw "The DSH plugin installation command failed with exit code $LASTEXITCODE."
  }

  Write-Host ""
  Write-Host "Installed. Verifying..." -ForegroundColor Green
  & $dsh plugin --profile $Profile list dsh-plugin-edueval
  if ($LASTEXITCODE -ne 0) {
    throw "The plugin was added, but verification failed. Open DSH and check the sidebar."
  }

  if (-not $running.Count -and -not $NoLaunch) {
    $app = Join-Path $env:LOCALAPPDATA "Programs\DeepSeek Harness\DeepSeek Harness.exe"
    if (Test-Path -LiteralPath $app) {
      Write-Host ""
      Write-Host "Starting DeepSeek Harness..." -ForegroundColor Cyan
      Start-Process -FilePath $app
    }
  }

  Write-Host ""
  Write-Host "Done. Open EduEval Studio from the left sidebar." -ForegroundColor Green
  Write-Host "Each user must enter their own API keys; no keys are included." -ForegroundColor Green
  Pause-IfNeeded
  exit 0
}
catch {
  Write-Host ""
  Write-Host "Installation failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host ""
  Write-Host "Manual install:"
  Write-Host "  dsh plugin --profile $Profile add `"$($scriptDir)\dsh-plugin-edueval-1.0.0.tgz`""
  Pause-IfNeeded
  exit 1
}
