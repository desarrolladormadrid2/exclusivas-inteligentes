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

  # Stop the scheduled task as well as its Node child.  Starting a task while
  # its PowerShell wrapper is still finishing is ignored when the task uses
  # MultipleInstances=IgnoreNew, which can leave production offline.
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  $crmProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like '*server-selfhost.mjs*' }
  $crmProcesses | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

  $deadline = (Get-Date).AddSeconds(30)
  do {
    $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue
    $remaining = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
      Where-Object { $_.CommandLine -like '*server-selfhost.mjs*' }
    if ((-not $taskInfo -or $taskInfo.State -ne 'Running') -and -not $remaining) { break }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)

  if ($remaining) { throw 'The previous CRM process did not stop within 30 seconds.' }
  Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList '--env-file=.env.local','server-selfhost.mjs' -WorkingDirectory $productionRoot -WindowStyle Hidden

  $healthDeadline = (Get-Date).AddSeconds(30)
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
