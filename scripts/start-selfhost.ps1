$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = 'C:\ProgramData\ExclusivasInteligentes'
$logPath = Join-Path $runtimeRoot 'logs\selfhost.log'
New-Item -ItemType Directory -Path (Split-Path -Parent $logPath) -Force | Out-Null
Set-Location $projectRoot
$env:NODE_ENV = 'production'
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
& 'C:\Program Files\nodejs\node.exe' '--env-file=.env.local' 'server-selfhost.mjs' *>> $logPath
