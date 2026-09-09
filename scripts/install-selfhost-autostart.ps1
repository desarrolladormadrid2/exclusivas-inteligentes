$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'start-selfhost.ps1'
$taskName = 'ExclusivasInteligentes\CRM self-hosted'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output 'Self-hosted CRM autostart installed and started.'
