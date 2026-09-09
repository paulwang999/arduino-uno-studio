import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { readSketch, sketchPathsFromArguments } = require('../electron/sketch-files.cjs')
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'studio-file-open-'))
const coldFile = path.join(fixtureRoot, 'My first sketch.ino')
const warmName = '\u7fc5\u8180\u6d4b\u8bd5 second sketch.INO'
const coldCode = 'const int coldLaunchMarker = 37;\nvoid setup() {}\nvoid loop() {}\n'

try {
  await writeFile(coldFile, coldCode)
  await writeFile(path.join(fixtureRoot, warmName), 'const int warmLaunchMarker = 42;\nvoid setup() {}\nvoid loop() {}\n')
  await writeFile(path.join(fixtureRoot, 'empty.ino'), '')
  await writeFile(path.join(fixtureRoot, 'dialog sketch.ino'), 'const int dialogOpenMarker = 19;\nvoid setup() {}\nvoid loop() {}\n')
  await mkdir(path.join(fixtureRoot, 'folder.ino'))

  assert.deepEqual(sketchPathsFromArguments([
    '--updated', '--user-data-dir=ignored.ino', '--', 'My first sketch.ino',
    'My first sketch.ino', warmName, 'not-a-sketch.exe',
  ], fixtureRoot), [coldFile, path.join(fixtureRoot, warmName)])
  assert.deepEqual(sketchPathsFromArguments([`"${coldFile}"`]), [coldFile])
  assert.deepEqual(await readSketch(coldFile), { filePath: coldFile, name: path.basename(coldFile), code: coldCode })
  assert.equal((await readSketch(path.join(fixtureRoot, 'empty.ino'))).code, '')
  await assert.rejects(readSketch(path.join(fixtureRoot, 'missing.ino')))
  await assert.rejects(readSketch(path.join(fixtureRoot, 'folder.ino')))

  const env = { ...process.env, ARDUINO_STUDIO_FILE_TEST_ROOT: fixtureRoot }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.VITE_DEV_SERVER_URL
  delete env.ARDUINO_STUDIO_SMOKE_TEST
  const child = spawn(require('electron'), [path.join(project, 'scripts', 'file-open-harness.cjs'), coldFile], {
    cwd: project, env, windowsHide: true, stdio: 'inherit',
  })
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  assert.equal(exitCode, 0, 'Electron file-open integration tests failed')
  const report = JSON.parse(await readFile(path.join(fixtureRoot, 'report.json'), 'utf8'))
  console.log(`Sketch file-open tests passed: ${JSON.stringify(report)}`)
} finally {
  await rm(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
