$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\install-resilience.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath
