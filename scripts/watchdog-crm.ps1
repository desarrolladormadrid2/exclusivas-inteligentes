$projectRoot = 'C:\Users\luism\Desktop\exclusivas-inteligentes'
$logDir = 'C:\ProgramData\ExclusivasInteligentes\logs'
$logPath = Join-Path $logDir 'watchdog.log'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Write-Log {
  param([string]$Message)
  $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  "$ts $Message" | Out-File -FilePath $logPath -Append -Encoding utf8
}

$crmProcess = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*server-selfhost.mjs*' }

if ($crmProcess) {
  try {
    $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/' -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) { exit 0 }
  } catch {
    Write-Log "CRM process alive (PID $($crmProcess.ProcessId)) but HTTP check failed. Restarting..."
    Stop-Process -Id $crmProcess.ProcessId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }
} else {
  Write-Log "CRM process not found. Starting..."
}

Start-Process -FilePath 'node' -ArgumentList '--env-file=.env.local','server-selfhost.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden
Start-Sleep -Seconds 5

$check = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*server-selfhost.mjs*' }
if ($check) {
  Write-Log "CRM started successfully (PID $($check.ProcessId))."
} else {
  Write-Log "CRM start failed!"
}
