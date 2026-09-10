$ErrorActionPreference = 'Stop'

$baseUrl = 'http://127.0.0.1:3000'
foreach ($path in @('/', '/api/clients', '/api/products')) {
  $response = Invoke-WebRequest -Uri ($baseUrl + $path) -UseBasicParsing -TimeoutSec 20
  if ($response.StatusCode -ne 200) { throw "$path returned HTTP $($response.StatusCode)" }
  Write-Output "$path HTTP $($response.StatusCode)"
}

Write-Output 'Production health checks passed.'
