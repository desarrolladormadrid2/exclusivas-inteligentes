$projectRoot = 'C:\Users\luism\Desktop\exclusivas-inteligentes'
$logDir = 'C:\ProgramData\ExclusivasInteligentes\logs'
$logPath = Join-Path $logDir 'watchdog.log'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Write-Log {
  param([string]$Message)
  $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  "$ts $Message" | Out-File -FilePath $logPath -Append -Encoding utf8
}

function Test-CrmHealth {
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    & node -e "const http=require('http');const r=http.get({host:'127.0.0.1',port:3000,path:'/',timeout:15000},res=>{process.exit(res.statusCode===200?0:1)});r.on('timeout',()=>process.exit(1));r.on('error',()=>process.exit(1))" 2>$null
    if ($LASTEXITCODE -eq 0) {
      if ($attempt -gt 1) { Write-Log "CRM healthy after $attempt attempts (slow but alive)." }
      return $true
    }
    Start-Sleep -Seconds 8
  }
  return $false
}

$listener = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  Where-Object { $_.State -eq 'Listen' } |
  Select-Object -First 1

if ($listener) {
  if (Test-CrmHealth) { exit 0 }
  Write-Log "Port 3000 occupied by PID $($listener.OwningProcess) but HTTP check failed. Restarting..."
  Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
} else {
  Write-Log "No process on port 3000. Starting CRM..."
}

$stale = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*server-selfhost.mjs*' }
$stale | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Process -FilePath 'node' -ArgumentList '--env-file=.env.local','server-selfhost.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden
Start-Sleep -Seconds 10

if (Test-CrmHealth) {
  Write-Log "CRM restarted and healthy."
} else {
  Write-Log "CRM failed to start or not healthy after multiple attempts!"
}