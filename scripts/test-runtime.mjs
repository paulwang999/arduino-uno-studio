import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtime = path.join(root, '.runtime')
const executable = path.join(runtime, 'bin', 'arduino-cli.exe')
const temp = path.join(os.tmpdir(), `arduino-uno-studio-test-${Date.now()}`)
const sketch = path.join(temp, 'BlinkTest')
const output = path.join(temp, 'output')

const env = {
  ...process.env,
  ARDUINO_DIRECTORIES_DATA: path.join(runtime, 'data'),
  ARDUINO_DIRECTORIES_DOWNLOADS: path.join(runtime, 'downloads'),
  ARDUINO_DIRECTORIES_USER: path.join(runtime, 'user'),
  ARDUINO_UPDATER_ENABLE_NOTIFICATION: 'false',
}

const code = `void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(250);
  digitalWrite(LED_BUILTIN, LOW);
  delay(250);
}
`

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, stdio: 'inherit', windowsHide: true })
    child.on('error', reject)
    child.on('close', (exitCode) => (exitCode === 0 ? resolve() : reject(new Error(`Compile failed (${exitCode})`))))
  })
}

try {
  await Promise.all([mkdir(sketch, { recursive: true }), mkdir(output, { recursive: true })])
  await writeFile(path.join(sketch, 'BlinkTest.ino'), code, 'utf8')
  await run(['compile', '--fqbn', 'arduino:avr:uno', '--output-dir', output, sketch])
  const hex = await readFile(path.join(output, 'BlinkTest.ino.hex'), 'utf8')
  if (!hex.startsWith(':')) throw new Error('Compiler output is not Intel HEX.')
  console.log(`Runtime test passed (${hex.length} HEX characters).`)
} finally {
  await rm(temp, { recursive: true, force: true })
}
