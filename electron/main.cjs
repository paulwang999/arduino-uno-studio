const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { readSketch, sketchPathKey, sketchPathsFromArguments } = require('./sketch-files.cjs')
const {
  monitorArguments,
  normalizeBaudRate,
  normalizePortAddress,
  parseDetectedPorts,
  uploadArguments,
} = require('./hardware.cjs')

const APP_NAME = 'Arduino Uno Studio'
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL)
let packagedRuntimeDrive = ''
let hardwareMonitor = null

const isHardwareSmokeTest = Boolean(process.env.ARDUINO_STUDIO_SMOKE_TEST)
const sketchWindows = new Map()
const launchFiles = sketchPathsFromArguments(process.argv.slice(process.defaultApp ? 2 : 1))
const isPrimaryInstance = app.requestSingleInstanceLock({ sketchFiles: launchFiles })
let pendingFileOpens = Promise.resolve()

function focusWindow(window) {
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function trackSketchPath(sender, filePath) {
  const document = sketchWindows.get(sender.id)
  if (!document) return
  document.filePath = filePath
  document.window.setTitle(filePath ? `${path.basename(filePath)} - ${APP_NAME}` : APP_NAME)
}

async function showSketchOpenError(filePath, error) {
  await dialog.showMessageBox({
    type: 'error',
    title: 'Unable to open sketch',
    message: `Could not open ${path.basename(filePath)}.`,
    detail: `${filePath}\n\n${String(error.message || error)}`,
  })
}

function enqueueFileOpens(filePaths) {
  // Explorer can launch multiple processes before the first window is ready.
  pendingFileOpens = pendingFileOpens.then(async () => {
    await app.whenReady()
    for (const filePath of filePaths) {
      const existing = [...sketchWindows.values()].find((document) => (
        document.filePath && sketchPathKey(document.filePath) === sketchPathKey(filePath)
      ))
      if (existing) {
        focusWindow(existing.window)
        continue
      }
      try {
        createWindow(await readSketch(filePath))
      } catch (error) {
        await showSketchOpenError(filePath, error)
      }
    }
    if (sketchWindows.size === 0) createWindow()
    else if (filePaths.length === 0) focusWindow([...sketchWindows.values()].at(-1).window)
  })
  return pendingFileOpens
}

if (!isPrimaryInstance) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv, workingDirectory, additionalData) => {
    const files = Array.isArray(additionalData?.sketchFiles)
      ? additionalData.sketchFiles
      : argv.slice(process.defaultApp ? 2 : 1)
    enqueueFileOpens(sketchPathsFromArguments(files, workingDirectory))
  })
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    enqueueFileOpens([filePath])
  })
}

function existingRuntimeDrive(target) {
  const result = spawnSync('subst', [], { windowsHide: true, encoding: 'utf8' })
  if (result.status !== 0) return ''
  const normalizedTarget = path.resolve(target).replace(/[\\/]+$/, '').toLowerCase()
  for (const line of String(result.stdout || '').split(/\r?\n/)) {
    const match = line.match(/^([A-Z]):\\: => (.+)$/i)
    if (!match) continue
    const mappedTarget = path.resolve(match[2]).replace(/[\\/]+$/, '').toLowerCase()
    if (mappedTarget === normalizedTarget) return `${match[1].toUpperCase()}:`
  }
  return ''
}

function runtimeRoot() {
  if (!app.isPackaged) return path.join(__dirname, '..', '.runtime')

  const bundledRuntime = path.join(process.resourcesPath, 'runtime-template')
  if (process.platform !== 'win32') return bundledRuntime
  if (packagedRuntimeDrive) return `${packagedRuntimeDrive}\\`

  const existingDrive = existingRuntimeDrive(bundledRuntime)
  if (existingDrive) {
    packagedRuntimeDrive = existingDrive
    return `${packagedRuntimeDrive}\\`
  }

  // AVR GCC 7 still uses MAX_PATH internally, so expose the runtime on a short drive.
  for (const letter of ['Z', 'Y', 'X', 'W', 'V', 'U']) {
    const drive = `${letter}:`
    if (fs.existsSync(`${drive}\\`)) continue
    const result = spawnSync('subst', [drive, bundledRuntime], { windowsHide: true })
    if (result.status === 0) {
      packagedRuntimeDrive = drive
      return `${drive}\\`
    }
  }

  return bundledRuntime
}

function removeRuntimeMapping() {
  if (!packagedRuntimeDrive) return
  spawnSync('subst', [packagedRuntimeDrive, '/D'], { windowsHide: true })
  packagedRuntimeDrive = ''
}

function cliPath() {
  return path.join(runtimeRoot(), 'bin', process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli')
}

function cliEnvironment() {
  const root = runtimeRoot()
  return {
    ...process.env,
    ARDUINO_DIRECTORIES_DATA: path.join(root, 'data'),
    ARDUINO_DIRECTORIES_DOWNLOADS: path.join(app.getPath('temp'), 'arduino-uno-studio-downloads'),
    ARDUINO_DIRECTORIES_USER: path.join(root, 'user'),
    ARDUINO_UPDATER_ENABLE_NOTIFICATION: 'false',
  }
}

function runProcess(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      ...options,
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    child.on('error', reject)
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }))
  })
}

async function getRuntimeStatus() {
  const executable = cliPath()
  if (!fs.existsSync(executable)) {
    return {
      ready: false,
      version: '',
      message: 'The bundled Arduino compiler is not installed.',
    }
  }

  try {
    const result = await runProcess(executable, ['version'], { env: cliEnvironment() })
    return {
      ready: result.exitCode === 0,
      version: (result.stdout || result.stderr).trim(),
      message: result.exitCode === 0 ? 'Arduino Uno compiler ready.' : result.stderr.trim(),
    }
  } catch (error) {
    return { ready: false, version: '', message: String(error.message || error) }
  }
}

async function compileSketch(code) {
  const status = await getRuntimeStatus()
  if (!status.ready) {
    return { ok: false, stdout: '', stderr: status.message, hex: '' }
  }

  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'arduino-uno-studio-'))
  const sketchDir = path.join(tempRoot, 'Sketch')
  const buildDir = path.join(tempRoot, 'build')
  const outputDir = path.join(tempRoot, 'output')

  try {
    await Promise.all([
      fsp.mkdir(sketchDir, { recursive: true }),
      fsp.mkdir(buildDir, { recursive: true }),
      fsp.mkdir(outputDir, { recursive: true }),
    ])
    await fsp.writeFile(path.join(sketchDir, 'Sketch.ino'), code, 'utf8')

    const result = await runProcess(
      cliPath(),
      [
        'compile',
        '--fqbn',
        'arduino:avr:uno',
        '--build-path',
        buildDir,
        '--output-dir',
        outputDir,
        '--warnings',
        'default',
        sketchDir,
      ],
      { env: cliEnvironment() },
    )

    if (result.exitCode !== 0) {
      return { ok: false, stdout: result.stdout, stderr: result.stderr, hex: '' }
    }

    const files = await fsp.readdir(outputDir)
    const hexFile = files.find((file) => file.endsWith('.ino.hex') && !file.includes('bootloader'))
    if (!hexFile) {
      return {
        ok: false,
        stdout: result.stdout,
        stderr: 'Compilation finished without producing an Arduino Uno HEX file.',
        hex: '',
      }
    }

    const hex = await fsp.readFile(path.join(outputDir, hexFile), 'utf8')
    return { ok: true, stdout: result.stdout, stderr: result.stderr, hex }
  } catch (error) {
    return { ok: false, stdout: '', stderr: String(error.message || error), hex: '' }
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function listHardwarePorts() {
  if (isHardwareSmokeTest) {
    return {
      ok: true,
      ports: [{
        address: 'COM_TEST',
        label: 'Arduino Uno Test Port',
        protocol: 'serial',
        protocolLabel: 'Serial Port (USB)',
        boardName: 'Arduino Uno',
        fqbn: 'arduino:avr:uno',
        isUno: true,
      }],
      message: 'Test Arduino Uno detected.',
    }
  }

  try {
    const result = await runProcess(cliPath(), ['board', 'list', '--format', 'json'], { env: cliEnvironment() })
    if (result.exitCode !== 0) {
      return { ok: false, ports: [], message: (result.stderr || result.stdout).trim() || 'Board discovery failed.' }
    }
    const ports = parseDetectedPorts(result.stdout)
    return { ok: true, ports, message: ports.length ? `${ports.length} serial device(s) detected.` : 'No USB serial device found. Check the USB data cable and Windows driver, then refresh.' }
  } catch (error) {
    return { ok: false, ports: [], message: String(error.message || error) }
  }
}

async function compileAndUploadSketch(code, requestedPort) {
  const status = await getRuntimeStatus()
  if (!status.ready) return { ok: false, stdout: '', stderr: status.message }

  let port
  try {
    port = normalizePortAddress(requestedPort, isHardwareSmokeTest)
  } catch (error) {
    return { ok: false, stdout: '', stderr: String(error.message || error) }
  }

  stopHardwareMonitor()
  if (isHardwareSmokeTest && port === 'COM_TEST') {
    const result = await compileSketch(code)
    return {
      ok: result.ok,
      stdout: [result.stdout, result.ok ? 'Upload verified on Arduino Uno test port.' : ''].filter(Boolean).join('\n'),
      stderr: result.stderr,
    }
  }

  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'arduino-uno-upload-'))
  const sketchDir = path.join(tempRoot, 'Sketch')
  const buildDir = path.join(tempRoot, 'build')
  const outputDir = path.join(tempRoot, 'output')

  try {
    await Promise.all([
      fsp.mkdir(sketchDir, { recursive: true }),
      fsp.mkdir(buildDir, { recursive: true }),
      fsp.mkdir(outputDir, { recursive: true }),
    ])
    await fsp.writeFile(path.join(sketchDir, 'Sketch.ino'), String(code || ''), 'utf8')
    const compileResult = await runProcess(cliPath(), [
      'compile',
      '--fqbn', 'arduino:avr:uno',
      '--build-path', buildDir,
      '--output-dir', outputDir,
      '--warnings', 'default',
      sketchDir,
    ], { env: cliEnvironment() })
    if (compileResult.exitCode !== 0) {
      return { ok: false, stdout: compileResult.stdout, stderr: compileResult.stderr }
    }

    const uploadResult = await runProcess(cliPath(), uploadArguments(port, outputDir), { env: cliEnvironment() })
    return {
      ok: uploadResult.exitCode === 0,
      stdout: [compileResult.stdout, uploadResult.stdout].filter(Boolean).join('\n'),
      stderr: [compileResult.stderr, uploadResult.stderr].filter(Boolean).join('\n'),
    }
  } catch (error) {
    return { ok: false, stdout: '', stderr: String(error.message || error) }
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

function sendHardwareSerial(sender, payload) {
  if (sender && !sender.isDestroyed()) sender.send('hardware:serial-event', payload)
}

function stopHardwareMonitor(sender) {
  const session = hardwareMonitor
  if (!session || (sender && session.sender !== sender)) return
  hardwareMonitor = null
  if (session.mock) {
    sendHardwareSerial(session.sender, { type: 'status', status: 'disconnected', message: 'USB Serial disconnected.' })
    return
  }
  if (!session.child.killed) session.child.kill()
}

async function startHardwareMonitor(sender, requestedPort, requestedBaudRate) {
  let port
  let baudRate
  try {
    port = normalizePortAddress(requestedPort, isHardwareSmokeTest)
    baudRate = normalizeBaudRate(requestedBaudRate)
  } catch (error) {
    return { ok: false, message: String(error.message || error) }
  }

  stopHardwareMonitor()
  if (isHardwareSmokeTest && port === 'COM_TEST') {
    const session = { mock: true, sender, port, baudRate }
    hardwareMonitor = session
    setTimeout(() => {
      if (hardwareMonitor !== session) return
      sendHardwareSerial(sender, { type: 'status', status: 'connected', message: `${port} connected at ${baudRate} baud.` })
      sendHardwareSerial(sender, { type: 'data', text: 'Arduino Uno hardware serial ready.\n' })
    }, 20)
    return { ok: true, message: `Opening ${port}...` }
  }

  const child = spawn(cliPath(), monitorArguments(port, baudRate), {
    env: cliEnvironment(),
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const session = { mock: false, child, sender, port, baudRate }
  hardwareMonitor = session
  child.stdout.on('data', (data) => sendHardwareSerial(sender, { type: 'data', text: data.toString() }))
  child.stderr.on('data', (data) => sendHardwareSerial(sender, { type: 'error', message: data.toString().trim() }))
  child.on('close', (exitCode) => {
    if (hardwareMonitor === session) hardwareMonitor = null
    sendHardwareSerial(sender, {
      type: 'status',
      status: 'disconnected',
      message: exitCode === 0 ? 'USB Serial disconnected.' : `USB Serial stopped with code ${exitCode}.`,
    })
  })

  return new Promise((resolve) => {
    child.once('spawn', () => {
      sendHardwareSerial(sender, { type: 'status', status: 'connected', message: `${port} connected at ${baudRate} baud.` })
      resolve({ ok: true, message: `Connected to ${port}.` })
    })
    child.once('error', (error) => {
      if (hardwareMonitor === session) hardwareMonitor = null
      resolve({ ok: false, message: String(error.message || error) })
    })
  })
}

function writeHardwareSerial(text) {
  const session = hardwareMonitor
  if (!session) return { ok: false, message: 'USB Serial is not connected.' }
  const value = String(text || '')
  if (session.mock) {
    sendHardwareSerial(session.sender, { type: 'data', text: `UNO received: ${value}` })
    return { ok: true, message: 'Sent.' }
  }
  if (!session.child.stdin.writable) return { ok: false, message: 'USB Serial is not writable.' }
  session.child.stdin.write(value)
  return { ok: true, message: 'Sent.' }
}

function createWindow(initialSketch = null) {
  const window = new BrowserWindow({
    width: 1500,
    height: 930,
    minWidth: 1120,
    minHeight: 700,
    show: false,
    title: APP_NAME,
    backgroundColor: '#111820',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const sender = window.webContents
  sketchWindows.set(sender.id, { window, initialSketch, filePath: initialSketch?.filePath ?? null })
  trackSketchPath(sender, initialSketch?.filePath ?? null)
  window.on('page-title-updated', (event) => event.preventDefault())
  window.on('closed', () => {
    stopHardwareMonitor(sender)
    sketchWindows.delete(sender.id)
  })

  window.once('ready-to-show', () => window.show())

  if (process.env.ARDUINO_STUDIO_SMOKE_TEST) {
    window.webContents.once('did-finish-load', async () => {
      const capturePath = path.resolve(process.env.ARDUINO_STUDIO_SMOKE_TEST)
      try {
        await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const deadline = Date.now() + 15000;
          const check = () => {
            const runButton = document.querySelector('.action-button.run');
            if (runButton && !runButton.disabled) return resolve(true);
            if (Date.now() > deadline) return reject(new Error('Run button did not become ready'));
            setTimeout(check, 100);
          };
          check();
        })`)
        const toolboxTest = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const categoryButtons = Array.from(document.querySelectorAll('[data-toolbox-category]'));
          const labels = categoryButtons.map((button) => button.querySelector('strong')?.textContent?.trim());
          const expected = ['Basics', 'Input', 'Output', 'LED Strip', 'Time', 'Logic', 'Loops', 'Variables', 'Math', 'Serial', 'Sound & Motion', 'Libraries'];
          const autocompleteCount = Number(document.querySelector('.monaco-shell')?.dataset.autocompleteCount || 0);
          const basics = document.querySelector('[data-toolbox-category="basics"]');
          const basicSnippets = Array.from(document.querySelectorAll('.toolbox-drawer [data-snippet-id]')).map((item) => item.dataset.snippetId);
          if (labels.join('|') !== expected.join('|') || basics?.getAttribute('aria-expanded') !== 'true' || basicSnippets.join('|') !== 'setup-loop|pin-mode' || autocompleteCount < 650) {
            return reject(new Error('Arduino toolbox categories or Basics drawer are invalid'));
          }
          document.querySelector('[data-toolbox-category="input"]')?.click();
          setTimeout(() => {
            const inputExpanded = document.querySelector('[data-toolbox-category="input"]')?.getAttribute('aria-expanded') === 'true';
            const inputSnippets = Array.from(document.querySelectorAll('.toolbox-drawer [data-snippet-id]')).map((item) => item.dataset.snippetId);
            const search = document.querySelector('.toolbox-search input');
            if (!inputExpanded || inputSnippets.join('|') !== 'digital-read|analog-read|ultrasonic-distance|pir-motion|ntc-temperature|slide-switch-read|joystick-read' || !search) {
              return reject(new Error('Input toolbox drawer is invalid'));
            }
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            valueSetter.call(search, 'serial');
            search.dispatchEvent(new Event('input', { bubbles: true }));
            setTimeout(() => {
              const searchResults = Array.from(document.querySelectorAll('.toolbox-search-results [data-snippet-id]')).map((item) => item.dataset.snippetId);
              const clear = document.querySelector('button[title="Clear search"]');
              if (searchResults.join('|') !== 'serial-begin|serial-println' || !clear) {
                return reject(new Error('Toolbox search results are invalid'));
              }
              clear.click();
              setTimeout(() => {
                if (!document.querySelector('.toolbox-categories')) return reject(new Error('Toolbox did not return after clearing search'));
                document.querySelector('[data-toolbox-category="variables"]')?.click();
                setTimeout(() => {
                  const variablesExpanded = document.querySelector('[data-toolbox-category="variables"]')?.getAttribute('aria-expanded') === 'true';
                  const variableSnippets = Array.from(document.querySelectorAll('.toolbox-drawer [data-snippet-id]')).map((item) => item.dataset.snippetId);
                  if (!variablesExpanded || variableSnippets.join('|') !== 'int|bool|const') {
                    return reject(new Error('Variables toolbox drawer is invalid'));
                  }
                  resolve({ categories: labels.length, basics: basicSnippets, input: inputSnippets, variables: variableSnippets, search: searchResults, autocompleteCount });
                }, 80);
              }, 80);
            }, 80);
          }, 80);
        })`)
        const autocompleteTarget = await window.webContents.executeJavaScript(`(() => {
          const editor = document.querySelector('.monaco-editor');
          if (!editor) return null;
          const rect = editor.getBoundingClientRect();
          return { x: Math.round(rect.left + Math.min(520, rect.width * 0.55)), y: Math.round(rect.top + Math.min(430, rect.height * 0.55)) };
        })()`)
        if (!autocompleteTarget) throw new Error('Monaco autocomplete input could not be focused')
        window.webContents.sendInputEvent({ type: 'mouseDown', ...autocompleteTarget, button: 'left', clickCount: 1 })
        window.webContents.sendInputEvent({ type: 'mouseUp', ...autocompleteTarget, button: 'left', clickCount: 1 })
        for (const keyCode of ['p', 'i', 'n']) {
          window.webContents.sendInputEvent({ type: 'char', keyCode })
        }
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space', modifiers: ['control'] })
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space', modifiers: ['control'] })
        const autocompleteUiTest = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const deadline = Date.now() + 2500;
          const check = () => {
            const widget = document.querySelector('.suggest-widget');
            const rows = Array.from(widget?.querySelectorAll('.monaco-list-row') || []);
            const text = rows.map((row) => row.textContent || '');
            if (text.some((value) => value.includes('pinMode'))) return resolve({ typed: 'pin', visibleSuggestions: rows.length, pinMode: true });
            if (Date.now() > deadline) {
              const editorText = document.querySelector('.view-lines')?.textContent || '';
              return reject(new Error('Typing pin did not show pinMode in the autocomplete menu: ' + JSON.stringify({ editorText: editorText.slice(-180), widgetClass: widget?.className || '', suggestions: text.slice(0, 12) })));
            }
            setTimeout(check, 60);
          };
          check();
        })`)
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
        for (let index = 0; index < 3; index += 1) {
          window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' })
          window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' })
        }
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] })
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] })
        await window.webContents.insertText(`void setup( {
pinMode(13, OUTPUT)
}

void loop() {
for (int i = 0; i < = 2; i++) {
digitalWrite(13, HIGH)
}
}`)
        const codeFixerTest = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const button = document.querySelector('[data-fix-code]');
          if (!button) return reject(new Error('Fix Code button is unavailable'));
          button.click();
          setTimeout(() => {
            const lines = Array.from(document.querySelectorAll('.view-lines .view-line')).map((line) => (line.textContent || '').replaceAll(String.fromCharCode(160), ' ')).join('\\n');
            const output = document.querySelector('.build-console pre')?.textContent || '';
            if (!lines.includes('void setup() {') || !lines.includes('pinMode(13, OUTPUT);') || !lines.includes('for (int i = 0; i <= 2; i++) {') || !lines.includes('digitalWrite(13, HIGH);')) {
              return reject(new Error('Fix Code did not repair punctuation: ' + lines));
            }
            if (!output.includes('Fix Code completed') || !output.includes('Indentation aligned')) {
              return reject(new Error('Fix Code did not report its result'));
            }
            const undo = document.querySelector('[data-editor-undo]');
            const redo = document.querySelector('[data-editor-redo]');
            if (!undo || undo.disabled || !redo || !redo.disabled) return reject(new Error('Undo/redo state is invalid after Fix Code'));
            undo.click();
            setTimeout(() => {
              const undone = Array.from(document.querySelectorAll('.view-lines .view-line')).map((line) => (line.textContent || '').replaceAll(String.fromCharCode(160), ' ')).join('\\n');
              if (!undone.includes('void setup( {') || undone.includes('pinMode(13, OUTPUT);') || redo.disabled) {
                return reject(new Error('Undo did not restore the uncorrected code: ' + undone));
              }
              redo.click();
              setTimeout(() => {
                const redone = Array.from(document.querySelectorAll('.view-lines .view-line')).map((line) => (line.textContent || '').replaceAll(String.fromCharCode(160), ' ')).join('\\n');
                if (!redone.includes('void setup() {') || !redone.includes('pinMode(13, OUTPUT);') || undo.disabled) {
                  return reject(new Error('Redo did not restore the corrected code: ' + redone));
                }
                resolve({ punctuation: true, undo: true, redo: true, output });
              }, 100);
            }, 100);
          }, 150);
        })`)
        const exampleLibraryTest = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const examplesButton = document.querySelector('.examples-button');
          if (!examplesButton) return reject(new Error('Examples button not found'));
          examplesButton.click();
          setTimeout(() => {
            const library = document.querySelector('.example-library');
            const search = document.querySelector('.example-search input');
            const rows = document.querySelectorAll('.example-row');
            const categoryButtons = Array.from(document.querySelectorAll('.example-categories button'));
            if (!library || !search || rows.length !== 137 || categoryButtons.length !== 21) {
              return reject(new Error('Example library count or categories are invalid'));
            }
            const communication = categoryButtons.find((button) => button.textContent.includes('04. Communication'));
            if (!communication) return reject(new Error('Communication example category not found'));
            communication.click();
            setTimeout(() => {
              const communicationCount = document.querySelectorAll('.example-row').length;
              if (communicationCount !== 12) return reject(new Error('Communication category count is invalid'));
              categoryButtons[0].click();
              const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
              valueSetter.call(search, 'Blink');
              search.dispatchEvent(new Event('input', { bubbles: true }));
              setTimeout(() => {
                const filteredCount = document.querySelectorAll('.example-row').length;
                const officialBlink = document.querySelector('[data-example-id="builtin:01.Basics/Blink/Blink"]');
                if (!officialBlink || filteredCount < 3) return reject(new Error('Example search did not find Blink'));
                officialBlink.click();
                setTimeout(() => {
                  const fileName = document.querySelector('.editor-heading strong')?.textContent?.trim();
                  if (!fileName?.startsWith('Blink.ino')) return reject(new Error('Official Blink example was not loaded'));
                  resolve({ total: rows.length, categories: categoryButtons.length - 1, communicationCount, filteredCount, fileName });
                }, 120);
              }, 100);
            }, 100);
          }, 120);
        })`)
        const catalogTest = await window.webContents.executeJavaScript(`(async () => {
          const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
          const initialComponentCount = document.querySelectorAll('[data-component]').length;
          const addButton = document.querySelector('button[title="Add component"]');
          if (initialComponentCount !== 0 || !addButton) throw new Error('Circuit did not start empty');
          addButton.click();
          await wait(100);
          const search = document.querySelector('.component-search input');
          const groups = Array.from(document.querySelectorAll('.component-catalog-group h3')).map((item) => item.textContent.trim());
          if (!search || groups.join(',') !== 'Basic,Sensors,Outputs,Prototyping,Power') throw new Error('Component catalog categories are invalid');
          const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          valueSetter.call(search, 'photo');
          search.dispatchEvent(new Event('input', { bubbles: true }));
          await wait(80);
          const photoVisible = Boolean(document.querySelector('[data-catalog-id="photoresistor"]'));
          const ledHidden = !document.querySelector('[data-catalog-id="led"]');
          if (!photoVisible || !ledHidden) throw new Error('Component catalog search did not filter');
          valueSetter.call(search, '');
          search.dispatchEvent(new Event('input', { bubbles: true }));
          await wait(80);

          const addPart = async (type) => {
            const item = document.querySelector('[data-catalog-id="' + type + '"]');
            if (!item || item.disabled) throw new Error(type + ' catalog item is unavailable');
            item.click();
            await wait(100);
          };
          const reopenCatalog = async () => {
            addButton.click();
            await wait(100);
          };

          await addPart('ultrasonic');
          const ultrasonicNode = document.querySelector('[data-component="ultrasonic"]');
          const ultrasonicSlider = ultrasonicNode?.querySelector('input[type="range"]');
          const ultrasonicTerminals = ultrasonicNode?.querySelectorAll('[data-terminal-id]') || [];
          if (!ultrasonicNode || ultrasonicSlider?.value !== '100' || ultrasonicTerminals.length !== 4) throw new Error('HC-SR04 component is incomplete');

          await reopenCatalog();
          await addPart('led');
          const firstCount = document.querySelectorAll('[data-component="led"]').length;
          if (firstCount !== 1) throw new Error('LED was not added from catalog');
          await reopenCatalog();
          await addPart('led');
          const duplicateCount = document.querySelectorAll('[data-component="led"]').length;
          if (duplicateCount !== 2) throw new Error('Repeated LED was not added as an independent instance');
          await reopenCatalog();
          await addPart('ws2812b');
          const stripNode = document.querySelector('[data-component="ws2812b"]');
          const stripCount = stripNode?.querySelector('input[type="number"]');
          if (!stripNode || stripCount?.value !== '8') throw new Error('WS2812B strip default is invalid');
          return { initialComponentCount, groups, photoVisible, ledHidden, duplicateCount, ws2812Count: Number(stripCount.value), ultrasonicDistance: Number(ultrasonicSlider.value) };
        })()`)
        const ultrasonicExampleTest = await window.webContents.executeJavaScript(`(async () => {
          const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
          document.querySelector('.examples-button')?.click();
          await wait(120);
          const search = document.querySelector('.example-search input');
          if (!search) throw new Error('Example search is unavailable for HC-SR04');
          const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          valueSetter.call(search, 'Ultrasonic');
          search.dispatchEvent(new Event('input', { bubbles: true }));
          await wait(100);
          const example = document.querySelector('[data-example-id="studio:ultrasonic"]');
          if (!example) throw new Error('HC-SR04 Studio example was not found');
          example.click();
          await wait(120);
          const fileName = document.querySelector('.editor-heading strong')?.textContent?.trim() || '';
          if (!fileName.startsWith('ultrasonic-distance.ino')) throw new Error('HC-SR04 Studio example was not loaded');
          return { fileName };
        })()`)
        await window.webContents.executeJavaScript(`document.querySelector('.action-button.run').click()`)
        const result = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const deadline = Date.now() + 30000;
          const check = () => {
            const build = document.querySelector('.build-result');
            const status = document.querySelector('.simulation-status strong');
            const circuitRunning = document.querySelector('.circuit-toolbar > span.live, .circuit-toolbar > span.fault');
            if (build?.classList.contains('error')) return reject(new Error('UI compilation failed'));
            if (build?.classList.contains('success') && (status?.textContent === 'RUNNING' || circuitRunning)) {
              return setTimeout(() => resolve({
                build: build.textContent.trim(),
                status: status?.textContent || 'RUNNING',
                circuit: Boolean(document.querySelector('.circuit-canvas')),
                ledOn: Boolean(document.querySelector('.circuit-led-visual.on')),
              }), 800);
            }
            if (Date.now() > deadline) return reject(new Error('Compile/run smoke test timed out'));
            setTimeout(check, 100);
          };
          check();
        })`)
        const ultrasonicSimulationTest = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          document.querySelector('[data-right-tab="serial"]')?.click();
          const deadline = Date.now() + 6000;
          const check = () => {
            const output = document.querySelector('.serial-content pre')?.textContent || '';
            const match = /Distance:\\s*([0-9.]+)\\s*cm/.exec(output);
            if (match) {
              const distance = Number(match[1]);
              if (distance < 98 || distance > 102) return reject(new Error('HC-SR04 simulated distance is inaccurate: ' + distance));
              document.querySelector('[data-right-tab="circuit"]')?.click();
              return setTimeout(() => resolve({ distance, output: match[0] }), 80);
            }
            if (Date.now() > deadline) return reject(new Error('HC-SR04 did not produce a Serial distance reading'));
            setTimeout(check, 80);
          };
          check();
        })`)
        result.ultrasonic = ultrasonicSimulationTest
        result.ultrasonicExample = ultrasonicExampleTest
        const restoredBlinkTest = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          document.querySelector('.examples-button')?.click();
          setTimeout(() => {
            const blink = document.querySelector('[data-example-id="builtin:01.Basics/Blink/Blink"]');
            if (!blink) return reject(new Error('Blink example was not available after HC-SR04 test'));
            blink.click();
            setTimeout(() => {
              document.querySelector('.action-button.run')?.click();
              const deadline = Date.now() + 30000;
              const check = () => {
                const build = document.querySelector('.build-result');
                const running = document.querySelector('.circuit-toolbar > span.live, .circuit-toolbar > span.fault');
                if (build?.classList.contains('error')) return reject(new Error('Blink failed to compile after HC-SR04 test'));
                if (build?.classList.contains('success') && running) return resolve({ fileName: document.querySelector('.editor-heading strong')?.textContent?.trim() || '' });
                if (Date.now() > deadline) return reject(new Error('Blink did not restart after HC-SR04 test'));
                setTimeout(check, 100);
              };
              check();
            }, 100);
          }, 120);
        })`)
        result.restoredBlink = restoredBlinkTest
        const clockTest = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const readVirtualMillis = () => {
            const text = document.querySelector('.circuit-toolbar strong')?.textContent || '';
            const match = text.match(/([0-9,]+) ms/);
            return match ? Number(match[1].replace(/,/g, '')) : NaN;
          };
          const startedAt = readVirtualMillis();
          const wallStartedAt = performance.now();
          if (!Number.isFinite(startedAt)) return reject(new Error('Virtual clock is unavailable'));
          setTimeout(() => {
            const endedAt = readVirtualMillis();
            const wallElapsed = performance.now() - wallStartedAt;
            const virtualElapsed = endedAt - startedAt;
            if (!Number.isFinite(endedAt) || virtualElapsed < 400 || virtualElapsed > 1800) {
              return reject(new Error('Virtual clock is not paced like a 16 MHz Uno'));
            }
            resolve({ wallElapsed: Math.round(wallElapsed), virtualElapsed });
          }, 1000);
        })`)
        result.clock = clockTest
        const restartTest = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const runButton = document.querySelector('.action-button.run');
          if (!runButton || runButton.disabled) return reject(new Error('Run button is unavailable before restart'));
          runButton.click();
          const deadline = Date.now() + 5000;
          const check = () => {
            const activeIndicator = document.querySelector('.circuit-toolbar > span.live, .circuit-toolbar > span.fault');
            const status = document.querySelector('.circuit-toolbar strong')?.textContent || '';
            const stopButton = document.querySelector('button[title="Stop simulation"]');
            if (activeIndicator && status.startsWith('RUNNING') && runButton.textContent.includes('Restart') && stopButton && !stopButton.disabled) {
              return resolve({ status, runLabel: runButton.textContent.trim(), stopEnabled: true });
            }
            if (Date.now() > deadline) return reject(new Error('Cached sketch restart did not reach a stable running state'));
            setTimeout(check, 50);
          };
          check();
        })`)
        result.restart = restartTest
        result.toolbox = toolboxTest
        result.autocomplete = autocompleteUiTest
        result.codeFixer = codeFixerTest
        result.examples = exampleLibraryTest
        result.catalog = catalogTest
        const wiringTest = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const ledNodes = document.querySelectorAll('[data-component="led"]');
          const ledNode = ledNodes[0];
          const secondLedNode = ledNodes[1];
          const ledId = ledNode?.dataset.componentId;
          const signal = ledNode?.querySelector('[data-terminal-id="' + ledId + ':A"]');
          const signalWire = document.querySelector('[data-wire-from="' + ledId + ':A"]');
          const pins = document.querySelectorAll('.circuit-digital-pins button');
          if (!signal || !signalWire || !secondLedNode || pins.length < 14) return reject(new Error('Independent duplicate circuit controls not found'));
          signalWire.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          setTimeout(() => {
            const removeWire = document.querySelector('button[title="Delete wire"]');
            if (!removeWire) return reject(new Error('Free wire delete control is unavailable'));
            removeWire.click();
            signal.click();
            setTimeout(() => {
              pins[12].click();
              const disconnectDeadline = Date.now() + 1200;
              const waitForDark = () => {
                const disconnectedDark = !ledNode.querySelector('.circuit-led-visual')?.classList.contains('on');
                if (disconnectedDark) {
                  const movedWire = document.querySelector('[data-wire-from="' + ledId + ':A"]');
                  movedWire?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                  return setTimeout(() => {
                    document.querySelector('button[title="Delete wire"]')?.click();
                    signal.click();
                    setTimeout(() => {
                      pins[13].click();
                      const reconnectDeadline = Date.now() + 1800;
                      const waitForLight = () => {
                        const reconnectedLit = ledNode.querySelector('.circuit-led-visual')?.classList.contains('on');
                        const secondLedDark = !secondLedNode.querySelector('.circuit-led-visual')?.classList.contains('on');
                        if (reconnectedLit && secondLedDark) return resolve({ disconnectedDark, reconnectedLit, secondLedDark, freeWireReconnected: true });
                        if (Date.now() > reconnectDeadline) return reject(new Error('Reconnected LED did not receive D13 output'));
                        setTimeout(waitForLight, 50);
                      };
                      waitForLight();
                    }, 50);
                  }, 50);
                }
                if (Date.now() > disconnectDeadline) return reject(new Error('LED stayed on after reconnecting it to D12'));
                setTimeout(waitForDark, 50);
              };
              waitForDark();
            }, 50);
          }, 50);
        })`)
        result.wiring = wiringTest
        const layoutTest = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const separator = document.querySelector('.panel-resizer');
          const panel = document.querySelector('.simulation-panel');
          const editor = document.querySelector('.editor-panel');
          const board = document.querySelector('.wokwi-uno-board');
          const workspace = document.querySelector('.circuit-canvas-sizer');
          if (!separator || !panel || !editor || !board || !workspace) return reject(new Error('Resizable workspace controls not found'));
          const initialWidth = panel.getBoundingClientRect().width;
          const initialBoardWidth = board.getBoundingClientRect().width;
          const initialWorkspaceWidth = workspace.getBoundingClientRect().width;
          separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
          setTimeout(() => {
            const resizedWidth = panel.getBoundingClientRect().width;
            const resizedBoardWidth = board.getBoundingClientRect().width;
            const resizedWorkspaceWidth = workspace.getBoundingClientRect().width;
            if (resizedWidth <= initialWidth) return reject(new Error('Circuit panel did not resize'));
            if (Math.abs(resizedBoardWidth - initialBoardWidth) > 1 || resizedWorkspaceWidth < initialWorkspaceWidth - 1) return reject(new Error('Resizing the panel enlarged circuit parts or reduced the workspace'));
            const maximize = document.querySelector('button[title="Maximize circuit"]');
            if (!maximize) return reject(new Error('Circuit maximize control not found'));
            maximize.click();
            setTimeout(() => {
              const editorHidden = getComputedStyle(editor).display === 'none';
              const expandedWidth = panel.getBoundingClientRect().width;
              const expandedBoardWidth = board.getBoundingClientRect().width;
              const expandedWorkspaceWidth = workspace.getBoundingClientRect().width;
              const restore = document.querySelector('button[title="Restore workspace"]');
              if (!editorHidden || expandedWidth <= resizedWidth || !restore || Math.abs(expandedBoardWidth - initialBoardWidth) > 1 || expandedWorkspaceWidth < resizedWorkspaceWidth - 1) {
                return reject(new Error('Circuit maximize state is invalid'));
              }
              restore.click();
              setTimeout(() => resolve({ initialWidth, resizedWidth, expandedWidth, initialBoardWidth, resizedBoardWidth, expandedBoardWidth, initialWorkspaceWidth, resizedWorkspaceWidth, expandedWorkspaceWidth, partsStayFixed: true, editorHidden }), 100);
            }, 150);
          }, 100);
        })`)
        result.layout = layoutTest
        const cameraTest = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const stage = document.querySelector('.circuit-stage');
          const board = document.querySelector('.wokwi-uno-board');
          const resetView = document.querySelector('button[title="Reset view"]');
          if (!stage || !board || !resetView) return reject(new Error('Circuit camera controls not found'));
          const stageBounds = stage.getBoundingClientRect();
          const initial = board.getBoundingClientRect();
          stage.dispatchEvent(new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            deltaY: -260,
            clientX: stageBounds.left + stageBounds.width * 0.55,
            clientY: stageBounds.top + stageBounds.height * 0.45,
          }));
          setTimeout(() => {
            const zoomed = board.getBoundingClientRect();
            const zoomValue = Number(stage.dataset.cameraZoom);
            if (!Number.isFinite(zoomValue) || zoomValue <= 1.2 || zoomed.width <= initial.width * 1.2) return reject(new Error('Mouse wheel did not zoom the complete circuit'));
            const panStartX = stageBounds.left + stageBounds.width * 0.75;
            const panStartY = stageBounds.top + stageBounds.height * 0.7;
            stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 91, button: 1, buttons: 4, clientX: panStartX, clientY: panStartY }));
            stage.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 91, button: 1, buttons: 4, clientX: panStartX + 72, clientY: panStartY + 44 }));
            stage.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 91, button: 1, buttons: 0, clientX: panStartX + 72, clientY: panStartY + 44 }));
            setTimeout(() => {
              const panned = board.getBoundingClientRect();
              if (Math.abs((panned.left - zoomed.left) - 72) > 3 || Math.abs((panned.top - zoomed.top) - 44) > 3) return reject(new Error('Middle-button drag did not pan the complete circuit'));
              resetView.click();
              setTimeout(() => {
                const restored = board.getBoundingClientRect();
                const restoredZoom = Number(stage.dataset.cameraZoom);
                if (Math.abs(restored.width - initial.width) > 1 || Math.abs(restored.left - initial.left) > 1 || Math.abs(restored.top - initial.top) > 1 || Math.abs(restoredZoom - 1) > 0.001) return reject(new Error('Reset view did not restore the circuit camera'));
                resolve({ initialWidth: initial.width, zoomedWidth: zoomed.width, zoomValue, panX: 72, panY: 44, reset: true });
              }, 120);
            }, 120);
          }, 120);
        })`)
        result.camera = cameraTest
        await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const stage = document.querySelector('.circuit-stage');
          if (!stage) return reject(new Error('Circuit camera disappeared before visual capture'));
          const bounds = stage.getBoundingClientRect();
          stage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -180, clientX: bounds.left + bounds.width * 0.6, clientY: bounds.top + bounds.height * 0.5 }));
          setTimeout(() => {
            const x = bounds.left + bounds.width * 0.7;
            const y = bounds.top + bounds.height * 0.7;
            stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 92, button: 1, buttons: 4, clientX: x, clientY: y }));
            stage.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 92, button: 1, buttons: 4, clientX: x + 52, clientY: y + 32 }));
            stage.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 92, button: 1, buttons: 0, clientX: x + 52, clientY: y + 32 }));
            setTimeout(resolve, 120);
          }, 120);
        })`)
        const cameraImage = await window.webContents.capturePage()
        await fsp.mkdir(path.dirname(capturePath), { recursive: true })
        await fsp.writeFile(capturePath.replace(/\.png$/i, '-camera.png'), cameraImage.toPNG())
        await window.webContents.executeJavaScript(`document.querySelector('button[title="Reset view"]')?.click()`)
        const componentLifecycleTest = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const beforeCount = document.querySelectorAll('[data-component="led"]').length;
          const remove = document.querySelector('[data-component="led"] .circuit-node-heading button');
          if (!remove) return reject(new Error('Remove component control not found'));
          remove.click();
          setTimeout(() => {
            const removed = document.querySelectorAll('[data-component="led"]').length === beforeCount - 1;
            const addButton = document.querySelector('button[title="Add component"]');
            if (!removed || !addButton) return reject(new Error('LED was not removed'));
            addButton.click();
            setTimeout(() => {
              const led = document.querySelector('[data-catalog-id="led"]');
              if (!led || led.disabled) return reject(new Error('LED catalog item is not reusable'));
              led.click();
              setTimeout(() => {
                const restoredCount = document.querySelectorAll('[data-component="led"]').length;
                if (restoredCount !== beforeCount) return reject(new Error('LED instance count was not restored'));
                addButton.click();
                setTimeout(() => {
                  const photo = document.querySelector('[data-catalog-id="photoresistor"]');
                  if (!photo || photo.disabled) return reject(new Error('Photoresistor catalog item is unavailable'));
                  photo.click();
                  setTimeout(() => {
                    const photoNode = document.querySelector('[data-component="photoresistor"]');
                    const slider = photoNode?.querySelector('input[type="range"]');
                    if (!photoNode || !slider) return reject(new Error('Photoresistor was not added'));
                    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                    valueSetter.call(slider, '300');
                    slider.dispatchEvent(new Event('input', { bubbles: true }));
                    setTimeout(() => resolve({
                      removed,
                      readded: restoredCount === beforeCount,
                      ledCount: restoredCount,
                      photoAdded: Boolean(photoNode),
                      photoValue: photoNode.querySelector('strong')?.textContent,
                    }), 100);
                  }, 100);
                }, 100);
              }, 100);
            }, 100);
          }, 100);
        })`)
        result.components = componentLifecycleTest
        const wireEditingTest = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const ledId = document.querySelector('[data-component="led"]')?.dataset.componentId;
          const ledGroundWire = document.querySelector('[data-wire-from="' + ledId + ':K"]');
          const ledGroundWireId = ledGroundWire?.dataset.wireId;
          const ledGroundVisible = document.querySelector('[data-wire-color-for="' + ledGroundWireId + '"]');
          const originalGroundPath = ledGroundVisible?.getAttribute('d');
          if (!ledGroundWire || !ledGroundVisible) return reject(new Error('LED ground wire is not editable'));
          ledGroundWire.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          setTimeout(() => {
            const removeWire = document.querySelector('button[title="Delete wire"]');
            if (!removeWire) return reject(new Error('Ground wire delete control is unavailable'));
            removeWire.click();
            const groundTerminal = document.querySelector('[data-terminal-id="' + ledId + ':K"]');
            groundTerminal?.click();
            setTimeout(() => {
              const groundPins = document.querySelectorAll('.circuit-power-pins [data-board-pin^="GND"]');
              const ground3 = document.querySelector('[data-board-pin="GND.3"]');
              const compatibleGroundPins = Array.from(groundPins).filter((pin) => pin.classList.contains('connectable')).length;
              if (compatibleGroundPins !== 3 || !ground3) return reject(new Error('Ground terminal destinations are incomplete'));
              ground3.click();
              setTimeout(() => {
                const movedGroundWire = document.querySelector('[data-wire-from="' + ledId + ':K"]');
                const movedGroundWireId = movedGroundWire?.dataset.wireId;
                const blue = document.querySelector('[data-wire-color="#54b8df"]');
                blue?.click();
                setTimeout(() => {
                  const photoId = document.querySelector('[data-component="photoresistor"]')?.dataset.componentId;
                  const updatedGroundPath = document.querySelector('[data-wire-color-for="' + movedGroundWireId + '"]')?.getAttribute('d');
                  const groundColor = document.querySelector('[data-wire-color-for="' + movedGroundWireId + '"]')?.getAttribute('stroke');
                  const photoPowerWire = document.querySelector('[data-wire-from="' + photoId + ':VCC"]');
                  if (groundColor !== '#54b8df' || updatedGroundPath === originalGroundPath || !photoPowerWire) return reject(new Error('Ground free wire did not update'));
                  photoPowerWire.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                  setTimeout(() => {
                    document.querySelector('button[title="Delete wire"]')?.click();
                    document.querySelector('[data-terminal-id="' + photoId + ':VCC"]')?.click();
                    setTimeout(() => {
                      const powerPins = document.querySelectorAll('.circuit-power-pins [data-board-pin="3.3V"], .circuit-power-pins [data-board-pin="5V"]');
                      const power33 = document.querySelector('[data-board-pin="3.3V"]');
                      const compatiblePowerPins = Array.from(powerPins).filter((pin) => pin.classList.contains('connectable')).length;
                      power33?.click();
                      setTimeout(() => {
                        const movedPowerWire = document.querySelector('[data-wire-from="' + photoId + ':VCC"]');
                        const movedPowerWireId = movedPowerWire?.dataset.wireId;
                        document.querySelector('[data-wire-color="#f2d54a"]')?.click();
                        setTimeout(() => {
                          const powerColor = document.querySelector('[data-wire-color-for="' + movedPowerWireId + '"]')?.getAttribute('stroke');
                          const photoVoltage = Number((document.querySelector('[data-component="photoresistor"] strong')?.textContent || '').replace('V', ''));
                          if (compatiblePowerPins !== 2 || powerColor !== '#f2d54a' || photoVoltage < 0.94 || photoVoltage > 1.0) return reject(new Error('Power free wire or 3.3V ADC scaling did not update'));
                          resolve({ compatibleGroundPins, groundColor, compatiblePowerPins, powerColor, photoVoltage, groundMoved: true, powerMoved: true });
                        }, 120);
                      }, 60);
                    }, 60);
                  }, 60);
                }, 60);
              }, 60);
            }, 60);
          }, 60);
        })`)
        result.wireEditing = wireEditingTest
        await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const ledId = document.querySelector('[data-component="led"]')?.dataset.componentId;
          const groundTerminal = document.querySelector('[data-terminal-id="' + ledId + ':K"]');
          if (!groundTerminal) return reject(new Error('LED ground terminal disappeared'));
          groundTerminal.click();
          setTimeout(() => {
            const canvas = document.querySelector('.circuit-canvas');
            const bounds = canvas?.getBoundingClientRect();
            if (!canvas || !bounds) return reject(new Error('Circuit canvas disappeared while drawing a wire'));
            canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: bounds.left + bounds.width * 0.55, clientY: bounds.top + bounds.height * 0.58 }));
            setTimeout(() => {
              const preview = document.querySelector('[data-wire-preview-from="' + ledId + ':K"]');
              const path = preview?.getAttribute('d') || '';
              return preview && path.length > 20 ? resolve(true) : reject(new Error('Terminal did not start a moving wire preview'));
            }, 80);
          }, 60);
        })`)
        const canvasImage = await window.webContents.capturePage()
        await fsp.mkdir(path.dirname(capturePath), { recursive: true })
        await fsp.writeFile(capturePath.replace(/\.png$/i, '-canvas.png'), canvasImage.toPNG())
        await window.webContents.executeJavaScript(`document.querySelector('button[title="Cancel wire (Esc)"]')?.click()`)
        const electricalUiTest = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const addPart = (type, done) => {
            document.querySelector('button[title="Add component"]')?.click();
            setTimeout(() => {
              const item = document.querySelector('[data-catalog-id="' + type + '"]');
              if (!item) return reject(new Error(type + ' is missing from the component catalog'));
              item.click();
              setTimeout(done, 100);
            }, 100);
          };
          addPart('breadboard', () => addPart('battery', () => addPart('resistor', () => {
            const breadboard = document.querySelector('[data-component="breadboard"]');
            const battery = document.querySelector('[data-component="battery"]');
            const resistor = document.querySelector('[data-component="resistor"]');
            const holes = breadboard?.querySelectorAll('.breadboard-hole') || [];
            if (!breadboard || !battery || !resistor || holes.length !== 420) return reject(new Error('Electrical component canvas is incomplete'));
            const visibleWireLayer = document.querySelector('.wire-visible-layer');
            const wireLayerZ = Number(visibleWireLayer ? getComputedStyle(visibleWireLayer).zIndex : NaN);
            const breadboardZ = Number(getComputedStyle(breadboard).zIndex);
            if (!visibleWireLayer || !Number.isFinite(wireLayerZ) || !Number.isFinite(breadboardZ) || wireLayerZ <= breadboardZ) return reject(new Error('Visible wires are not layered in front of circuit parts'));
            const batteryId = battery.dataset.componentId;
            const breadboardId = breadboard.dataset.componentId;
            const connect = (from, to, done) => {
              const source = document.querySelector('[data-terminal-id="' + from + '"]');
              const stageTop = document.querySelector('.circuit-stage')?.getBoundingClientRect().top;
              if (!source) return reject(new Error('Free-wire source not found: ' + from));
              source.click();
              setTimeout(() => {
                const preview = document.querySelector('[data-wire-preview-from="' + from + '"]');
                const currentStageTop = document.querySelector('.circuit-stage')?.getBoundingClientRect().top;
                if (!preview) return reject(new Error('Clicking a terminal did not start a visible wire preview'));
                if (stageTop !== undefined && currentStageTop !== undefined && Math.abs(stageTop - currentStageTop) > 1) return reject(new Error('Starting a wire moved the circuit canvas'));
                const target = document.querySelector('[data-terminal-id="' + to + '"]');
                if (!target) return reject(new Error('Free-wire target not found: ' + to));
                target.click();
                setTimeout(done, 100);
              }, 60);
            };
            connect(batteryId + ':+', breadboardId + ':top+1', () => {
              document.querySelector('button[title="Close wire editor"]')?.click();
              connect(batteryId + ':-', breadboardId + ':top-1', () => {
                document.querySelector('button[title="Close wire editor"]')?.click();
                connect(breadboardId + ':top+2', breadboardId + ':top-2', () => {
                  const deadline = Date.now() + 2500;
                  const waitForShort = () => {
                    const faultText = document.querySelector('.circuit-faults')?.textContent || '';
                    if (faultText.includes('shorted together')) {
                      const faultWire = document.querySelector('.wire-visible.error');
                      const remove = document.querySelector('button[title="Delete wire"]');
                      if (!faultWire || !remove) return reject(new Error('Short circuit was not highlighted or removable'));
                      remove.click();
                      return setTimeout(() => {
                        const remaining = document.querySelector('.circuit-faults')?.textContent || '';
                        if (remaining.includes('battery') && remaining.includes('shorted together')) return reject(new Error('Short circuit did not clear after deleting its wire'));
                        resolve({ holes: holes.length, freeWires: 2, wirePreview: true, stableCanvas: true, wiresInFront: true, shortDetected: true, shortCleared: true });
                      }, 180);
                    }
                    if (Date.now() > deadline) return reject(new Error('Battery short circuit was not detected'));
                    setTimeout(waitForShort, 80);
                  };
                  waitForShort();
                });
              });
            });
          })));
        })`)
        result.electrical = electricalUiTest
        const electricalExpanded = await window.webContents.executeJavaScript(`new Promise((resolve) => { document.querySelector('button[title="Maximize circuit"]')?.click(); setTimeout(() => { document.querySelector('[data-component="breadboard"]')?.scrollIntoView({ block: 'center' }); setTimeout(() => resolve(document.querySelector('.app-shell')?.classList.contains('circuit-expanded')), 120); }, 180); })`)
        if (!electricalExpanded) throw new Error('Electrical canvas did not maximize for visual verification')
        const electricalImage = await window.webContents.capturePage()
        await fsp.writeFile(capturePath.replace(/\.png$/i, '-electrical.png'), electricalImage.toPNG())
        await window.webContents.executeJavaScript(`document.querySelector('button[title="Restore workspace"]')?.click()`)
        const hardwareTest = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const hardwareTab = document.querySelector('[data-right-tab="hardware"]');
          if (!hardwareTab) return reject(new Error('Hardware tab not found'));
          hardwareTab.click();
          const readyDeadline = Date.now() + 3000;
          let uploadDeadline = 0;
          const waitForPort = () => {
            const port = document.querySelector('[data-hardware-port]');
            const upload = document.querySelector('[data-hardware-upload]');
            if (port?.value === 'COM_TEST' && upload && !upload.disabled) {
              uploadDeadline = Date.now() + 30000;
              upload.click();
              return waitForUpload();
            }
            if (Date.now() > readyDeadline) return reject(new Error('Test Arduino Uno was not discovered'));
            setTimeout(waitForPort, 50);
          };
          const waitForUpload = () => {
            const output = document.querySelector('.hardware-upload-output')?.textContent || '';
            const upload = document.querySelector('[data-hardware-upload]');
            if (output.includes('Upload verified on Arduino Uno test port.') && upload && !upload.disabled) {
              const connect = document.querySelector('[data-hardware-serial-connect]');
              if (!connect || connect.disabled) return reject(new Error('USB Serial connect control is unavailable'));
              serialDeadline = Date.now() + 5000;
              connect.click();
              return waitForSerial();
            }
            if (Date.now() > uploadDeadline) return reject(new Error('Arduino Uno upload test timed out'));
            setTimeout(waitForUpload, 100);
          };
          let serialDeadline = 0;
          const waitForSerial = () => {
            const output = document.querySelector('[data-hardware-serial-output]')?.textContent || '';
            const input = document.querySelector('[data-hardware-serial-input]');
            if (output.includes('Arduino Uno hardware serial ready.') && input && !input.disabled) {
              const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
              valueSetter.call(input, 'hello');
              input.dispatchEvent(new Event('input', { bubbles: true }));
              setTimeout(() => {
                const send = document.querySelector('.hardware-serial-input button');
                if (!send || send.disabled) return reject(new Error('USB Serial send control is unavailable'));
                echoDeadline = Date.now() + 3000;
                send.click();
                waitForEcho();
              }, 50);
              return;
            }
            if (Date.now() > serialDeadline) return reject(new Error('USB Serial did not connect'));
            setTimeout(waitForSerial, 50);
          };
          let echoDeadline = 0;
          const waitForEcho = () => {
            const output = document.querySelector('[data-hardware-serial-output]')?.textContent || '';
            if (output.includes('UNO received: hello')) {
              return resolve({ port: 'COM_TEST', uploaded: true, serialConnected: true, serialEcho: true });
            }
            if (Date.now() > echoDeadline) return reject(new Error('USB Serial echo test timed out'));
            setTimeout(waitForEcho, 50);
          };
          waitForPort();
        })`)
        result.hardware = hardwareTest
        const hardwareImage = await window.webContents.capturePage()
        await fsp.writeFile(capturePath.replace(/\.png$/i, '-hardware.png'), hardwareImage.toPNG())
        await window.webContents.executeJavaScript(`document.querySelector('[data-hardware-serial-disconnect]')?.click()`)
        await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const examplesButton = document.querySelector('.examples-button');
          if (!examplesButton) return reject(new Error('Examples button disappeared'));
          examplesButton.click();
          setTimeout(() => document.querySelector('.example-library') ? resolve(true) : reject(new Error('Example library did not reopen')), 100);
        })`)
        const image = await window.webContents.capturePage()
        await fsp.writeFile(capturePath, image.toPNG())
        console.log(`Electron smoke test passed: ${JSON.stringify(result)}`)
        console.log(`Screenshot: ${capturePath}`)
        removeRuntimeMapping()
        app.exit(0)
      } catch (error) {
        const details = await window.webContents.executeJavaScript(`({
          build: document.querySelector('.build-result')?.textContent?.trim(),
          output: document.querySelector('.build-console pre')?.textContent,
          status: document.querySelector('.simulation-status strong')?.textContent,
        })`).catch(() => null)
        const image = await window.webContents.capturePage().catch(() => null)
        if (image) {
          await fsp.mkdir(path.dirname(capturePath), { recursive: true })
          await fsp.writeFile(capturePath.replace(/\.png$/i, '-error.png'), image.toPNG())
        }
        await fsp.writeFile(capturePath.replace(/\.png$/i, '-error.json'), JSON.stringify({
          error: String(error.message || error),
          details,
        }, null, 2)).catch(() => null)
        console.error(`Electron smoke test failed: ${String(error.message || error)}`)
        if (details) console.error(JSON.stringify(details))
        removeRuntimeMapping()
        app.exit(1)
      }
    })
  }

  if (isDevelopment) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

if (isPrimaryInstance) app.whenReady().then(() => {
  ipcMain.handle('runtime:status', getRuntimeStatus)
  ipcMain.handle('sketch:compile', (_event, code) => compileSketch(String(code || '')))
  ipcMain.handle('hardware:list', listHardwarePorts)
  ipcMain.handle('hardware:upload', (_event, payload) => compileAndUploadSketch(String(payload?.code || ''), payload?.port))
  ipcMain.handle('hardware:serial-start', (event, payload) => startHardwareMonitor(event.sender, payload?.port, payload?.baudRate))
  ipcMain.handle('hardware:serial-stop', (event) => {
    stopHardwareMonitor(event.sender)
    return { ok: true, message: 'USB Serial disconnected.' }
  })
  ipcMain.handle('hardware:serial-write', (_event, text) => writeHardwareSerial(text))
  ipcMain.handle('sketch:initial', (event) => sketchWindows.get(event.sender.id)?.initialSketch ?? null)
  ipcMain.handle('sketch:set-path', (event, filePath) => trackSketchPath(event.sender, filePath))
  ipcMain.handle('sketch:open', async (event) => {
    const result = await dialog.showOpenDialog({
      title: 'Open Arduino sketch',
      properties: ['openFile'],
      filters: [{ name: 'Arduino sketch', extensions: ['ino', 'cpp', 'h', 'txt'] }],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    try {
      const sketch = await readSketch(filePath)
      trackSketchPath(event.sender, sketch.filePath)
      return sketch
    } catch (error) {
      await showSketchOpenError(filePath, error)
      return null
    }
  })
  ipcMain.handle('sketch:save', async (event, payload) => {
    const requestedPath = payload?.filePath
    let filePath = requestedPath

    if (!filePath) {
      const result = await dialog.showSaveDialog({
        title: 'Save Arduino sketch',
        defaultPath: 'arduino-project.ino',
        filters: [{ name: 'Arduino sketch', extensions: ['ino'] }],
      })
      if (result.canceled || !result.filePath) return null
      filePath = result.filePath
    }

    await fsp.writeFile(filePath, String(payload?.code || ''), 'utf8')
    trackSketchPath(event.sender, filePath)
    return { filePath, name: path.basename(filePath) }
  })
  ipcMain.handle('link:open', (_event, url) => {
    const target = String(url || '')
    if (target.startsWith('https://')) return shell.openExternal(target)
    return undefined
  })

  enqueueFileOpens(launchFiles)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  stopHardwareMonitor()
  removeRuntimeMapping()
})
