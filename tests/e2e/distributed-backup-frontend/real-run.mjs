// Reuse the existing SQLite fixture/test; avoid inherited native stdout pipes
// keeping PowerShell's Start invocation open after the child has exited.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createServer } from 'node:net'

const repository = resolve(import.meta.dirname, '../../..')
const evidence = process.env.DBF_EVIDENCE_DIR
if (!evidence || !resolve(evidence).startsWith(join(repository, '.local-qa', 'distributed-backup-frontend') + '\\')) throw new Error('Owned evidence directory required')
const port = 18097
const root = join(repository, 'output', 'backup-ui-20261025')
const instance = join(root, 'instance-' + randomUUID().replaceAll('-', '').slice(0, 8))
const checkedPort = await new Promise(resolve => {
  const probe = createServer(); probe.once('error', () => resolve(false))
  probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)))
})
if (!checkedPort) throw new Error('Isolated port occupied; refusing replacement')
await mkdir(join(instance, 'control'), { recursive: true }); await mkdir(join(instance, 'browser-downloads'))
await writeFile(join(instance, 'config.yaml'), `server:
  address: "127.0.0.1:${port}"
  base_path: "/rainbow-bridge"
database:
  driver: "sqlite"
  sqlite:
    path: "data/resource.db"
redis:
  enabled: false
storage:
  type: "local"
backup:
  enabled: true
  control_dir: "${join(instance, 'control').replaceAll('\\', '/')}"
auth:
  cookie_name: rb_backup_ui_qa
  cookie_secure: false
  allow_insecure_localhost: true
  trusted_origins:
    - "http://127.0.0.1:${port}"
intranet:
  enabled: true
log:
  level: "warn"
  output: "stdout"
`)
const env = { ...process.env, RB_BACKUP_UI_INSTANCE: instance, RB_BACKUP_UI_PORT: String(port),
  RB_QA_ADMIN_USERNAME: 'backup_qa', RB_QA_ADMIN_PASSWORD: 'Qa!' + randomUUID().replaceAll('-', ''),
  RAINBOW_AUTH_UI_URL: `http://127.0.0.1:${port}/rainbow-bridge/` }
function run(exe, args, stdio = 'ignore', timeout = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd: join(repository, 'tests', 'e2e'), env, windowsHide: true, stdio })
    const timer = setTimeout(() => { child.kill(); reject(new Error('Fixture command timed out')) }, timeout)
    child.once('error', () => { clearTimeout(timer); reject(new Error('Fixture command failed to start')) })
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Fixture command exited ${code}`)) })
  })
}
const lifecycle = mode => run('powershell.exe', ['-NoProfile', '-File', join(repository, 'tests/e2e/backup/instance.ps1'), '-Mode', mode], 'ignore', 30000)
const summary = { evidence_type: 'real isolated SQLite browser/API; no API interception', instance, port, started: false, passed: false, stopped: false }
try {
  await lifecycle('Start'); summary.started = true
  await run(process.execPath, [join(repository, 'tests/e2e/node_modules/@playwright/test/cli.js'), 'test', '--config=playwright.backup.config.ts'], 'inherit')
  await copyFile(join(instance, 'frontend-evidence.json'), join(evidence, 'sqlite-frontend-evidence.json'))
  summary.passed = true
} catch (error) { summary.failure = error.message; process.exitCode = 1 }
finally {
  try { await lifecycle('Stop'); summary.stopped = true } catch (error) { summary.cleanup_failure = error.message; process.exitCode = 1 }
  await writeFile(join(evidence, 'sqlite-summary.json'), JSON.stringify(summary, null, 2))
  delete env.RB_QA_ADMIN_PASSWORD; delete env.RB_QA_ADMIN_USERNAME
  process.stdout.write(JSON.stringify(summary) + '\n')
}
