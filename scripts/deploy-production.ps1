$ErrorActionPreference = 'Stop'

$source = (Get-Location).Path
$productionRoot = 'C:\Users\luism\Desktop\exclusivas-inteligentes'
$taskName = 'ExclusivasInteligentes\CRM self-hosted'

if ((Resolve-Path $source).Path -eq (Resolve-Path $productionRoot).Path) {
  throw 'The runner workspace must be separate from the persistent production directory.'
}

$robocopyArgs = @(
  $source, $productionRoot, '/E', '/R:2', '/W:2', '/NFL', '/NDL', '/NP',
  '/XD', '.git', 'node_modules', '.next', '.vinext', 'data', 'logs',
  'whatsapp-gateway\node_modules', 'whatsapp-gateway\sessions', 'whatsapp-gateway\logs',
  'whatsapp-gateway\_IGNORE_exclusivas-inteligentes',
  '/XF', '.env', '.env.*', '*.sqlite', '*.sqlite-wal', '*.sqlite-shm', '*.log'
)

& robocopy @robocopyArgs
if ($LASTEXITCODE -gt 7) { throw "Code deployment failed with robocopy exit code $LASTEXITCODE" }

Push-Location $productionRoot
try {
  if (-not (Test-Path -LiteralPath '.env.local')) { throw 'Missing persistent .env.local in production directory.' }
  $env:NODE_ENV = 'production'
  npm.cmd ci --omit=dev
  npm.cmd run build

  # Restart via the SYSTEM watchdog task (flag-based). The runner cannot kill
  # the SYSTEM-owned CRM directly (Win32_Process CommandLine is empty for it
  # and Stop-Process fails), which previously left a stale process serving an
  # old build manifest. We signal the watchdog to force a restart by port.
  $flagPath = Join-Path $productionRoot 'scripts\restart.flag'
  $prePid = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
  Set-Content -LiteralPath $flagPath -Value 'restart' -Encoding ascii -NoNewline

  $restartDeadline = (Get-Date).AddSeconds(150)
  $newPid = $null
  do {
    $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
      $newPid = $listener.OwningProcess
      if ($newPid -ne $prePid) { break }
    }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $restartDeadline)

  if (-not $newPid -or $newPid -eq $prePid) {
    throw 'The CRM did not restart (watchdog did not swap the process on port 3000).'
  }

  $healthDeadline = (Get-Date).AddSeconds(45)
  $health = $null
  do {
    & node -e "const h=require('http').request({host:'127.0.0.1',port:3000,path:'/',timeout:15000},r=>process.exit(r.statusCode===200?0:1));h.on('timeout',()=>process.exit(1));h.on('error',()=>process.exit(2));h.end()" 2>$null
    if ($LASTEXITCODE -eq 0) { $health = $true; break }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $healthDeadline)

  if (-not $health) {
    throw 'The CRM did not become healthy after restart.'
  }
} finally {
  Pop-Location
}

Write-Output 'CRM production deployed and restart requested. WhatsApp gateway was not restarted.'
