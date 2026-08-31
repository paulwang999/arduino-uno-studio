import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtime = path.join(root, '.runtime')
const executable = path.join(runtime, 'bin', 'arduino-cli.exe')
const generatedSource = await readFile(path.join(root, 'src', 'generatedExamples.ts'), 'utf8')
const marker = 'export const generatedExamples: ArduinoExample[] = '
const jsonStart = generatedSource.indexOf(marker)
if (jsonStart === -1) throw new Error('Generated example data was not found.')

const examples = JSON.parse(generatedSource.slice(jsonStart + marker.length).trim())
  .filter((example) => example.compatibility === 'uno')
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'arduino-uno-examples-'))
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
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (data) => { stdout += data.toString() })
    child.stderr.on('data', (data) => { stderr += data.toString() })
    child.on('error', reject)
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }))
  })
}

let nextIndex = 0
let completed = 0
const failures = []

async function worker() {
  while (nextIndex < examples.length) {
    const index = nextIndex
    nextIndex += 1
    const example = examples[index]
    const caseRoot = path.join(tempRoot, `case-${String(index).padStart(3, '0')}`)
    const sketchDir = path.join(caseRoot, 'Sketch')
    const buildDir = path.join(caseRoot, 'build')
    const outputDir = path.join(caseRoot, 'output')
    await Promise.all([
      mkdir(sketchDir, { recursive: true }),
      mkdir(buildDir, { recursive: true }),
      mkdir(outputDir, { recursive: true }),
    ])
    await writeFile(path.join(sketchDir, 'Sketch.ino'), example.code, 'utf8')
    const compileArgs = [
      'compile',
      '--fqbn', 'arduino:avr:uno',
      '--build-path', buildDir,
      '--output-dir', outputDir,
      '--warnings', 'none',
      sketchDir,
    ]
    let result = await run(compileArgs)
    if (result.exitCode !== 0) {
      const retryBuildDir = path.join(caseRoot, 'build-retry')
      const retryOutputDir = path.join(caseRoot, 'output-retry')
      await Promise.all([mkdir(retryBuildDir, { recursive: true }), mkdir(retryOutputDir, { recursive: true })])
      result = await run(compileArgs.map((arg) => arg === buildDir ? retryBuildDir : arg === outputDir ? retryOutputDir : arg))
    }
    if (result.exitCode !== 0) {
      failures.push({ id: example.id, name: example.name, output: (result.stderr || result.stdout).trim() })
    }
    completed += 1
    if (completed % 10 === 0 || completed === examples.length) {
      console.log(`Compiled ${completed}/${examples.length} Uno examples...`)
    }
  }
}

try {
  await Promise.all(Array.from({ length: Math.min(4, examples.length) }, () => worker()))
  if (failures.length) {
    for (const failure of failures) {
      console.error(`\nFAILED ${failure.id} (${failure.name})\n${failure.output}`)
    }
    throw new Error(`${failures.length} Uno example(s) failed to compile.`)
  }
  console.log(`Example test passed: ${examples.length} sketches compiled for arduino:avr:uno.`)
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}
