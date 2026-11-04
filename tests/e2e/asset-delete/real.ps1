$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$evidence = Join-Path $repository '.local-qa/asset-delete-20261104'
$instance = Join-Path $evidence ('instance-' + [guid]::NewGuid().ToString('N').Substring(0,8))
$port = 18107
if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw 'Isolated test port occupied' }
New-Item -ItemType Directory -Force -Path $instance | Out-Null
$configuration = @"
server:
  address: "127.0.0.1:$port"
  base_path: "/rainbow-bridge"
database:
  driver: sqlite
  sqlite:
    path: data/resource.db
redis:
  enabled: false
storage:
  type: local
backup:
  enabled: false
auth:
  cookie_name: rb_asset_delete_qa
  cookie_secure: false
  allow_insecure_localhost: true
  trusted_origins:
    - "http://127.0.0.1:$port"
log:
  level: warn
"@
[IO.File]::WriteAllText((Join-Path $instance 'config.yaml'), $configuration)
$variables = @('RAINBOW_ADMIN_USERNAME','RAINBOW_ADMIN_INITIAL_PASSWORD','RB_QA_ADMIN_USERNAME','RB_QA_ADMIN_PASSWORD','FRONTEND_DIR','RAINBOW_AUTH_UI_URL','RAINBOW_AUTH_RESULTS_DIR','RB_ASSET_DELETE_EVIDENCE')
$previous = @{}
foreach ($variable in $variables) { $previous[$variable] = [Environment]::GetEnvironmentVariable($variable,'Process') }
$ownedProcess = $null
$exe = Join-Path $evidence 'server.exe'
try {
  $env:RB_QA_ADMIN_USERNAME = 'qa_asset_' + [guid]::NewGuid().ToString('N').Substring(0,8)
  $env:RB_QA_ADMIN_PASSWORD = 'Qa!' + [guid]::NewGuid().ToString('N')
  $env:RAINBOW_ADMIN_USERNAME = $env:RB_QA_ADMIN_USERNAME
  $env:RAINBOW_ADMIN_INITIAL_PASSWORD = $env:RB_QA_ADMIN_PASSWORD
  $env:FRONTEND_DIR = Join-Path $repository 'vue/dist'
  $env:RAINBOW_AUTH_UI_URL = "http://127.0.0.1:$port/rainbow-bridge/"
  $env:RAINBOW_AUTH_RESULTS_DIR = Join-Path $evidence 'real-results'
  $env:RB_ASSET_DELETE_EVIDENCE = $evidence
  $ownedProcess = Start-Process -FilePath $exe -ArgumentList '--config', (Join-Path $instance 'config.yaml') -WorkingDirectory $instance -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $instance 'stdout.log') -RedirectStandardError (Join-Path $instance 'stderr.log')
  $startedTicks = $ownedProcess.StartTime.ToUniversalTime().Ticks
  $ready = $false
  for ($attempt=0; $attempt -lt 100; $attempt++) {
    try { if ((Invoke-WebRequest -Uri ($env:RAINBOW_AUTH_UI_URL + 'api/v1/version') -TimeoutSec 2).StatusCode -eq 200) { $ready=$true; break } } catch {}
    if ($ownedProcess.HasExited) { throw 'Isolated backend exited; inspect local test logs' }
    Start-Sleep -Milliseconds 200
  }
  if (!$ready) { throw 'Isolated backend not ready' }
  Push-Location (Join-Path $repository 'tests/e2e')
  try { npx playwright test --config=playwright.asset-delete.config.ts; if ($LASTEXITCODE -ne 0) { throw 'Basic real asset-delete test failed' } } finally { Pop-Location }
} finally {
  if ($ownedProcess) {
    $running = Get-Process -Id $ownedProcess.Id -ErrorAction SilentlyContinue
    if ($running) {
      if ($running.Path -ne $exe -or $running.StartTime.ToUniversalTime().Ticks -ne $startedTicks) { throw 'Process ownership mismatch' }
      Stop-Process -Id $running.Id
    }
  }
  foreach ($variable in $variables) { [Environment]::SetEnvironmentVariable($variable,$previous[$variable],'Process') }
  @{instance=$instance;port=$port;stopped=(@(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue).Count -eq 0)} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'real-process.json')
}
