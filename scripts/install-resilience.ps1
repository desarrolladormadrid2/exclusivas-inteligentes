$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Ejecuta este script desde PowerShell como administrador.'
}

$projectRoot = 'C:\Users\luism\Desktop\exclusivas-inteligentes'

# --- 1. CRM self-hosted task (start at boot, restart on failure) ---
$crmScript = Join-Path $projectRoot 'scripts\start-selfhost.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$crmScript`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Days 365)
$principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'ExclusivasInteligentes\CRM self-hosted' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Output '[OK] CRM self-hosted task registered (start at boot + auto-restart).'

# --- 2. CRM watchdog task (checks every 60 seconds) ---
$watchdogScript = Join-Path $projectRoot 'scripts\watchdog-crm.ps1'
$actionW = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$watchdogScript`""
$triggerW = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$settingsW = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds 30)
$principalW = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'ExclusivasInteligentes\CRM watchdog' -Action $actionW -Trigger $triggerW -Settings $settingsW -Principal $principalW -Force | Out-Null
Write-Output '[OK] CRM watchdog task registered (checks every 60s).'

# --- 3. Start CRM now ---
Start-ScheduledTask -TaskName 'ExclusivasInteligentes\CRM self-hosted'
Write-Output '[OK] CRM started.'

# --- 4. Verify ---
Start-Sleep -Seconds 5
$crm = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*server-selfhost.mjs*' }
if ($crm) {
  Write-Output "[OK] CRM process running (PID $($crm.ProcessId))."
} else {
  Write-Warning 'CRM process NOT found after start!'
}

Write-Output ''
Write-Output 'Instalacion completa. El CRM se arranca solo al reiniciar y se auto-recupera si crashea.'
