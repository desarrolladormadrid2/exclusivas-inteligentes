$ErrorActionPreference = 'Stop'

$baseUrl = 'http://127.0.0.1:3000'
$publicUrl = if ($env:PUBLIC_CRM_URL) { $env:PUBLIC_CRM_URL.TrimEnd('/') } else { 'https://crm.desarrolladormadrid.com' }
$expectedVersion = (Get-Content -Raw -LiteralPath (Join-Path (Get-Location) 'package.json') | ConvertFrom-Json).version
foreach ($path in @('/', '/api/clients', '/api/products')) {
  $response = Invoke-WebRequest -Uri ($baseUrl + $path) -UseBasicParsing -TimeoutSec 20
  if ($response.StatusCode -ne 200) { throw "$path returned HTTP $($response.StatusCode)" }
  Write-Output "$path HTTP $($response.StatusCode)"
}

$versionResponse = Invoke-WebRequest -Uri ($baseUrl + '/api/version') -UseBasicParsing -TimeoutSec 20
$localVersion = ($versionResponse.Content | ConvertFrom-Json).version
if ($localVersion -ne $expectedVersion) { throw "Local /api/version returned $localVersion but expected $expectedVersion" }
Write-Output "Local /api/version $localVersion"

$publicVersionResponse = Invoke-WebRequest -Uri ($publicUrl + '/api/version') -UseBasicParsing -TimeoutSec 30
$publicVersion = ($publicVersionResponse.Content | ConvertFrom-Json).version
if ($publicVersion -ne $expectedVersion) {
  throw "Public $publicUrl/api/version returned $publicVersion but expected $expectedVersion. The public proxy is not serving the deployed production root."
}
Write-Output "Public /api/version $publicVersion"

Write-Output 'Production health checks passed.'
