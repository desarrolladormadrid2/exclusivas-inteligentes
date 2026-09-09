$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $projectRoot 'logs\selfhost.log'
New-Item -ItemType Directory -Path (Split-Path -Parent $logPath) -Force | Out-Null
Set-Location $projectRoot
$env:NODE_ENV = 'production'
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
& 'C:\Program Files\nodejs\node.exe' '--env-file=.env.local' 'server-selfhost.mjs' *>> $logPath
