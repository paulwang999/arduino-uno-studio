import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareSnippet, snippets } from '../src/snippets.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtime = path.join(root, '.runtime')
const executable = path.join(runtime, 'bin', 'arduino-cli.exe')
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'studio-sonar-api-'))
const sketchDir = path.join(tempRoot, 'SonarApiTest')
const outputDir = path.join(tempRoot, 'output')
const env = {
  ...process.env,
  ARDUINO_DIRECTORIES_DATA: path.join(runtime, 'data'),
  ARDUINO_DIRECTORIES_DOWNLOADS: path.join(runtime, 'downloads'),
  ARDUINO_DIRECTORIES_USER: path.join(runtime, 'user'),
  ARDUINO_UPDATER_ENABLE_NOTIFICATION: 'false',
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, windowsHide: true })
    let output = ''
    child.stdout.on('data', (data) => { output += data.toString() })
    child.stderr.on('data', (data) => { output += data.toString() })
    child.on('error', reject)
    child.on('close', (exitCode) => exitCode === 0 ? resolve(output) : reject(new Error(output || `Compile failed (${exitCode})`)))
  })
}

try {
  const snippet = snippets.find((candidate) => candidate.id === 'ultrasonic-distance')
  if (!snippet) throw new Error('Sonar distance snippet is missing.')
  const sketch = prepareSnippet('', snippet, 0).code.replace(
    'int distance = sonar.ping(trigPin, echoPin);',
    'int distance = sonar.ping(trigPin, echoPin, PingUnit::CENTIMETERS);',
  )

  await Promise.all([mkdir(sketchDir, { recursive: true }), mkdir(outputDir, { recursive: true })])
  await writeFile(path.join(sketchDir, 'SonarApiTest.ino'), sketch, 'utf8')
  await run(['compile', '--fqbn', 'arduino:avr:uno', '--output-dir', outputDir, sketchDir])
  await readFile(path.join(outputDir, 'SonarApiTest.ino.hex'), 'utf8')
  console.log('StudioSonar API test passed: one-line sonar.ping sketch compiled for Arduino Uno.')
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}
