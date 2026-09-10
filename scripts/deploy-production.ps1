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
  $crmProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like '*server-selfhost.mjs*' }
  $crmProcesses | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-ScheduledTask -TaskName $taskName
} finally {
  Pop-Location
}

Write-Output 'CRM production deployed and restart requested. WhatsApp gateway was not restarted.'
