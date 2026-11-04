param([ValidateSet('both','default','disabled')][string]$Mode = 'both')
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$evidence = Join-Path $repository '.local-qa/auth-disabled-20261104'
$port = 18108
$exe = Join-Path $evidence 'server.exe'
$variables = @('RAINBOW_ADMIN_USERNAME','RAINBOW_ADMIN_INITIAL_PASSWORD','RB_QA_ADMIN_USERNAME','RB_QA_ADMIN_PASSWORD','FRONTEND_DIR','RAINBOW_AUTH_UI_URL','RB_QA_AUTH_DISABLED','RB_AUTH_MODE_EVIDENCE')
$previous = @{}
foreach ($variable in $variables) { $previous[$variable] = [Environment]::GetEnvironmentVariable($variable,'Process') }
$owned = $null
$reports = @()
try {
  $modes = if ($Mode -eq 'default') { @($false) } elseif ($Mode -eq 'disabled') { @($true) } else { @($true,$false) }
  foreach ($disabled in $modes) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw 'Owned test port occupied' }
    $instance = Join-Path $evidence ('instance-' + [guid]::NewGuid().ToString('N').Substring(0,8))
    New-Item -ItemType Directory -Path $instance | Out-Null
    $enabledLine = if ($disabled) { '  enabled: false' } else { '' }
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
$enabledLine
  cookie_name: rb_auth_mode_qa
  cookie_secure: false
  allow_insecure_localhost: true
  trusted_origins:
    - "http://127.0.0.1:$port"
log:
  level: warn
"@
    [IO.File]::WriteAllText((Join-Path $instance 'config.yaml'), $configuration)
    $env:RB_QA_ADMIN_USERNAME = 'qa_mode_' + [guid]::NewGuid().ToString('N').Substring(0,8)
    $env:RB_QA_ADMIN_PASSWORD = 'Qa!' + [guid]::NewGuid().ToString('N')
    $env:RAINBOW_ADMIN_USERNAME = $env:RB_QA_ADMIN_USERNAME
    $env:RAINBOW_ADMIN_INITIAL_PASSWORD = $env:RB_QA_ADMIN_PASSWORD
    $env:FRONTEND_DIR = Join-Path $repository 'vue/dist'
    $env:RAINBOW_AUTH_UI_URL = "http://127.0.0.1:$port/rainbow-bridge/"
    $env:RB_QA_AUTH_DISABLED = $disabled.ToString().ToLowerInvariant()
    $env:RB_AUTH_MODE_EVIDENCE = $evidence
    try {
      $owned = Start-Process -FilePath $exe -ArgumentList '--config', (Join-Path $instance 'config.yaml') -WorkingDirectory $instance -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $instance 'stdout.log') -RedirectStandardError (Join-Path $instance 'stderr.log')
      $ticks = $owned.StartTime.ToUniversalTime().Ticks
      $ready = $false
      for ($attempt=0; $attempt -lt 100; $attempt++) {
        try { if ((Invoke-WebRequest -Uri ($env:RAINBOW_AUTH_UI_URL+'api/v1/version') -TimeoutSec 2).StatusCode -eq 200) { $ready=$true; break } } catch {}
        if ($owned.HasExited) { throw 'Local candidate exited' }
        Start-Sleep -Milliseconds 200
      }
      if (!$ready) { throw 'Local candidate not ready' }
      Push-Location (Join-Path $repository 'tests/e2e')
      try { node auth-mode/real.mjs; if ($LASTEXITCODE -ne 0) { throw 'Basic auth-mode UI flow failed; inspect safe report' } } finally { Pop-Location }
    } finally {
      if ($owned) {
        $running = Get-Process -Id $owned.Id -ErrorAction SilentlyContinue
        if ($running) {
          if ($running.Path -ne $exe -or $running.StartTime.ToUniversalTime().Ticks -ne $ticks) { throw 'Process ownership mismatch' }
          Stop-Process -Id $running.Id
        }
        $reports += @{instance=$instance;mode=$env:RB_QA_AUTH_DISABLED;stopped=$true}
        $owned = $null
      }
    }
  }
} finally {
  foreach ($variable in $variables) { [Environment]::SetEnvironmentVariable($variable,$previous[$variable],'Process') }
  $reports | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence ('processes-' + $Mode + '.json'))
}
