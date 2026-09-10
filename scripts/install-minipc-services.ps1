$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Ejecuta este script desde PowerShell como administrador.'
}

$owner = 'desarrolladormadrid2'
$repo = 'exclusivas-inteligentes'
$runnerRoot = 'C:\Users\luism\actions-runner\exclusivas-inteligentes'
$token = $env:GITHUB_PERSONAL_ACCESS_TOKEN
if (-not $token) { throw 'Falta GITHUB_PERSONAL_ACCESS_TOKEN en el entorno del usuario.' }

$headers = @{
  Authorization = "Bearer $token"
  Accept = 'application/vnd.github+json'
  'X-GitHub-Api-Version' = '2022-11-28'
}
$registrationToken = (Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$owner/$repo/actions/runners/registration-token" -Headers $headers).token

if (-not (Test-Path -LiteralPath $runnerRoot)) { throw "No existe el runner en $runnerRoot" }
Push-Location $runnerRoot
try {
  & .\config.cmd --unattended --url "https://github.com/$owner/$repo" --token $registrationToken --name 'minipc-exclusivas-inteligentes' --labels 'self-hosted,Windows,exclusivas-inteligentes' --work '_work' --replace --runasservice
  if ($LASTEXITCODE -ne 0) { throw "No se pudo instalar el runner como servicio. Código $LASTEXITCODE" }
} finally {
  Pop-Location
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'install-production-task.ps1')
Write-Output 'Runner y CRM production task installed.'
