$ErrorActionPreference = 'Stop'

$projectRoot = 'C:\Users\luism\Desktop\exclusivas-inteligentes'
$scriptPath = Join-Path $projectRoot 'scripts\start-selfhost.ps1'
$taskName = 'ExclusivasInteligentes\CRM self-hosted'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "Installed and started $taskName"
