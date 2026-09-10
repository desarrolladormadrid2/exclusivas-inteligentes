$projectRoot = 'C:\Users\luism\Desktop\exclusivas-inteligentes'
$logDir = 'C:\ProgramData\ExclusivasInteligentes\logs'
$logPath = Join-Path $logDir 'watchdog.log'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Write-Log {
  param([string]$Message)
  $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  "$ts $Message" | Out-File -FilePath $logPath -Append -Encoding utf8
}

$crmRunning = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*server-selfhost.mjs*' }

if ($crmRunning) {
  try {
    $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/' -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) { exit 0 }
  } catch {
    Write-Log "CRM process alive but HTTP check failed: $_"
  }
}

Write-Log "CRM not responding. Restarting..."

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*server-selfhost.mjs*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep -Seconds 2

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$projectRoot\scripts\start-selfhost.ps1`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(5)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'ExclusivasInteligentes\CRM watchdog-launch' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-Sleep -Seconds 8

$check = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*server-selfhost.mjs*' }
if ($check) {
  Write-Log "CRM restarted successfully."
} else {
  Write-Log "CRM restart failed!"
}
