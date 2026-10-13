$ErrorActionPreference = 'Stop'

$productionRoot = 'C:\Users\luism\Desktop\exclusivas-inteligentes'
$confirmation = [string]$env:MIGRATION_CONFIRMATION
$expectedConfirmation = 'MIGRAR_PRODUCCION_A_LOCAL'
if ($confirmation -ne $expectedConfirmation) {
  throw "Migración no autorizada. Ejecuta la tarea con MIGRATION_CONFIRMATION=$expectedConfirmation."
}
if (-not (Test-Path -LiteralPath $productionRoot)) { throw "No existe el directorio de producción: $productionRoot" }

Push-Location $productionRoot
$envFile = Join-Path $productionRoot '.env.local'
$dataDir = Join-Path $productionRoot 'data'
$backupDir = Join-Path $dataDir 'backups'
$localDatabase = Join-Path $dataDir 'excluvas.sqlite'
$marker = Join-Path $dataDir 'production-database-local.migrated'
$changedEnv = $false
$envBackup = $null
$oldLocalBackup = $null

function Get-EnvValue([string]$name, [string[]]$lines) {
  $line = $lines | Where-Object { $_ -match "^$([regex]::Escape($name))=" } | Select-Object -First 1
  if ($null -eq $line) { return '' }
  return ([string]$line).Substring($name.Length + 1).Trim()
}

function Restart-Crm {
  $flagPath = Join-Path $productionRoot 'scripts\restart.flag'
  $prePid = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
  Set-Content -LiteralPath $flagPath -Value 'restart' -Encoding ascii -NoNewline
  $deadline = (Get-Date).AddSeconds(150)
  do {
    $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener -and $listener.OwningProcess -ne $prePid) { return }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)
  throw 'El CRM no se reinició mediante el watchdog.'
}

try {
  if (-not (Test-Path -LiteralPath $envFile)) { throw "Falta $envFile" }
  $envLines = @(Get-Content -LiteralPath $envFile)
  $currentMode = Get-EnvValue 'DATABASE_MODE' $envLines
  if ($currentMode -eq 'local') {
    Write-Output 'La producción ya está configurada con SQLite local; no se repite la migración.'
    exit 0
  }
  if ($currentMode -ne 'remote') { throw "DATABASE_MODE actual no esperado: '$currentMode'" }
  if (Test-Path -LiteralPath $marker) { throw "Existe el marcador de migración: $marker" }

  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $envBackup = Join-Path $backupDir "env-local-before-local-$stamp.env"
  Copy-Item -LiteralPath $envFile -Destination $envBackup -Force
  if (Test-Path -LiteralPath $localDatabase) {
    $oldLocalBackup = Join-Path $backupDir "excluvas-before-local-migration-$stamp.sqlite"
    Copy-Item -LiteralPath $localDatabase -Destination $oldLocalBackup -Force
  }

  $env:SYNC_LOCAL_PATH = 'excluvas.sqlite'
  & node scripts\sync-turso-to-local.mjs
  if ($LASTEXITCODE -ne 0) { throw "La sincronización Turso → SQLite terminó con código $LASTEXITCODE" }
  if (-not (Test-Path -LiteralPath $localDatabase)) { throw 'La SQLite sincronizada no se ha creado.' }

  $updatedLines = @()
  $modeWritten = $false
  foreach ($line in $envLines) {
    if ($line -match '^DATABASE_MODE=') { $updatedLines += 'DATABASE_MODE=local'; $modeWritten = $true } else { $updatedLines += $line }
  }
  if (-not $modeWritten) { $updatedLines += 'DATABASE_MODE=local' }
  Set-Content -LiteralPath $envFile -Value $updatedLines -Encoding utf8
  $changedEnv = $true
  Set-Content -LiteralPath $marker -Value "Migración Turso a SQLite local completada: $stamp`nCopia de entorno: $envBackup`nCopia SQLite anterior: $oldLocalBackup" -Encoding utf8
  Restart-Crm

  $version = Invoke-RestMethod -Uri 'https://crm.desarrolladormadrid.com/api/version?database_migration_check=1' -TimeoutSec 45
  if ($version.database -ne 'SQLite local') { throw "La aplicación no confirma SQLite local: $($version | ConvertTo-Json -Compress)" }
  Write-Output ($version | ConvertTo-Json -Compress)
  Write-Output "Migración completada. Copia de entorno: $envBackup"
  Write-Output "Copia SQLite anterior: $oldLocalBackup"
} catch {
  if ($changedEnv -and $envBackup -and (Test-Path -LiteralPath $envBackup)) {
    Copy-Item -LiteralPath $envBackup -Destination $envFile -Force
    try { Restart-Crm } catch { Write-Warning "No se pudo reiniciar durante la recuperación: $($_.Exception.Message)" }
  }
  throw
} finally {
  Remove-Item Env:\SYNC_LOCAL_PATH -ErrorAction SilentlyContinue
  Pop-Location
}
