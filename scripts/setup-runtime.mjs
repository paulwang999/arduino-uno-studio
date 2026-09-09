import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtime = path.join(root, '.runtime')
const archive = path.join(runtime, 'arduino-cli.zip')
const executable = path.join(runtime, 'bin', 'arduino-cli.exe')
const downloadUrl = 'https://downloads.arduino.cc/arduino-cli/arduino-cli_1.5.1_Windows_64bit.zip'

const env = {
  ...process.env,
  ARDUINO_DIRECTORIES_DATA: path.join(runtime, 'data'),
  ARDUINO_DIRECTORIES_DOWNLOADS: path.join(runtime, 'downloads'),
  ARDUINO_DIRECTORIES_USER: path.join(runtime, 'user'),
  ARDUINO_UPDATER_ENABLE_NOTIFICATION: 'false',
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, stdio: 'inherit', windowsHide: true })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`arduino-cli ${args.join(' ')} failed (${code})`))))
  })
}

function extractArchive() {
  const escapePath = (value) => value.replaceAll("'", "''")
  const command = `Expand-Archive -LiteralPath '${escapePath(archive)}' -DestinationPath '${escapePath(path.join(runtime, 'bin'))}' -Force`
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      stdio: 'inherit',
      windowsHide: true,
    })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Archive extraction failed (${code})`)))
  })
}

async function download() {
  console.log('Downloading the official Arduino CLI...')
  const response = await fetch(downloadUrl)
  if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status} ${response.statusText}`)
  await pipeline(response.body, createWriteStream(archive))
}

async function pruneFastLedRuntime() {
  const library = path.join(runtime, 'user', 'libraries', 'FastLED')
  const libraryEntries = ['agents', 'ci', 'cookbook', 'docker', 'docs', 'examples', 'extras', 'tests', 'tools', 'wiki']
  await Promise.all([
    ...libraryEntries.map((entry) => rm(path.join(library, entry), { recursive: true, force: true })),
    rm(path.join(library, 'src', 'platforms', 'wasm', 'compiler'), { recursive: true, force: true }),
  ])
}

await rm(runtime, { recursive: true, force: true })
await Promise.all([
  mkdir(path.join(runtime, 'bin'), { recursive: true }),
  mkdir(path.join(runtime, 'data'), { recursive: true }),
  mkdir(path.join(runtime, 'downloads'), { recursive: true }),
  mkdir(path.join(runtime, 'user', 'libraries'), { recursive: true }),
])

await download()
await extractArchive()
await rm(archive, { force: true })

await run(['version'])
await run(['core', 'update-index'])
await run(['core', 'install', 'arduino:avr'])

for (const library of ['Servo', 'LiquidCrystal', 'Stepper', 'SD', 'CapacitiveSensor@0.5.1', 'FastLED@3.10.5', 'Adafruit BusIO@1.17.4', 'Adafruit GFX Library@1.12.6', 'Adafruit SSD1306@2.5.17']) {
  await run(['lib', 'install', library])
}
await pruneFastLedRuntime()
await cp(
  path.join(root, 'bundled-libraries', 'StudioSonar'),
  path.join(runtime, 'user', 'libraries', 'StudioSonar'),
  { recursive: true },
)

await rm(path.join(runtime, 'downloads'), { recursive: true, force: true })
await mkdir(path.join(runtime, 'downloads'), { recursive: true })
console.log('Arduino Uno runtime is ready.')
