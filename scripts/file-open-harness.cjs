const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')
const { app, BrowserWindow, dialog } = require('electron')

const fixtureRoot = process.env.ARDUINO_STUDIO_FILE_TEST_ROOT
if (!fixtureRoot) throw new Error('Run this harness through npm run file-open:test.')
app.setPath('userData', path.join(fixtureRoot, 'profile'))

const errors = []
let nextOpenPath = null
let nextSavePath = null
dialog.showMessageBox = async (options) => { errors.push(options); return { response: 0 } }
dialog.showOpenDialog = async () => ({ canceled: !nextOpenPath, filePaths: nextOpenPath ? [nextOpenPath] : [] })
dialog.showSaveDialog = async () => ({ canceled: !nextSavePath, filePath: nextSavePath })

require(process.env.ARDUINO_STUDIO_TEST_MAIN || '../electron/main.cjs')

async function until(check, message, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await check()
    if (result) return result
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(message)
}

async function windowFor(name) {
  return until(async () => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.getTitle().startsWith(`${name} - `) || window.webContents.isLoading()) continue
      const ready = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.monaco-editor textarea'))`)
      if (ready) return window
    }
    return null
  }, `Sketch window did not load: ${name}`)
}

async function editorText(window) {
  return window.webContents.executeJavaScript(`document.querySelector('.view-lines')?.textContent?.replace(/\\u00a0/g, ' ') || ''`)
}

async function expectCode(window, text) {
  await until(async () => (await editorText(window)).includes(text), `Editor did not contain ${text}`)
}

async function launchAgain(files) {
  const child = spawn(process.execPath, [__filename, ...files], {
    cwd: fixtureRoot, env: process.env, windowsHide: true, stdio: 'inherit',
  })
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  assert.equal(exitCode, 0, 'Second instance failed to hand off its sketch')
}

async function run() {
  const cold = await windowFor('My first sketch.ino')
  await expectCode(cold, 'coldLaunchMarker = 37')
  assert.equal(BrowserWindow.getAllWindows().length, 1)
  assert(!(await editorText(cold)).includes('LED_BUILTIN'), 'Default Blink replaced the requested file')
  cold.show()
  cold.focus()
  const editorPoint = await cold.webContents.executeJavaScript(`(() => {
    const rect = document.querySelector('.monaco-editor').getBoundingClientRect();
    return { x: Math.round(rect.left + 180), y: Math.round(rect.top + 65) };
  })()`)
  cold.webContents.sendInputEvent({ type: 'mouseDown', ...editorPoint, button: 'left', clickCount: 1 })
  cold.webContents.sendInputEvent({ type: 'mouseUp', ...editorPoint, button: 'left', clickCount: 1 })
  cold.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'End', modifiers: ['control'] })
  cold.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'End', modifiers: ['control'] })
  cold.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
  cold.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
  for (const keyCode of '// unsavedMarker') cold.webContents.sendInputEvent({ type: 'char', keyCode })
  await expectCode(cold, 'unsavedMarker')

  const warmName = '\u7fc5\u8180\u6d4b\u8bd5 second sketch.INO'
  await launchAgain([warmName])
  const warm = await windowFor(warmName)
  await expectCode(warm, 'warmLaunchMarker = 42')
  await expectCode(cold, 'unsavedMarker')
  assert.equal(BrowserWindow.getAllWindows().length, 2)

  cold.minimize()
  await launchAgain(['My first sketch.ino'])
  await until(() => !cold.isMinimized(), 'Existing sketch was not restored')
  assert.equal(BrowserWindow.getAllWindows().length, 2)
  await expectCode(cold, 'unsavedMarker')

  await cold.webContents.executeJavaScript(`document.querySelector('button[title="Save sketch"]').click()`)
  await until(async () => (await fs.readFile(path.join(fixtureRoot, 'My first sketch.ino'), 'utf8')).includes('unsavedMarker'), 'Save used the wrong sketch path')

  await launchAgain(['empty.ino'])
  const empty = await windowFor('empty.ino')
  await until(async () => !(await editorText(empty)).trim(), 'Empty file incorrectly loaded Blink')
  nextOpenPath = path.join(fixtureRoot, 'dialog sketch.ino')
  await empty.webContents.executeJavaScript(`document.querySelector('button[title="Open sketch"]').click()`)
  await expectCode(empty, 'dialogOpenMarker = 19')
  await launchAgain(['dialog sketch.ino'])
  assert.equal(BrowserWindow.getAllWindows().length, 3, 'Open Sketch did not update window tracking')

  nextSavePath = path.join(fixtureRoot, 'saved as.ino')
  await empty.webContents.executeJavaScript(`document.querySelector('button[title="Save as a new sketch"]').click()`)
  await until(() => empty.getTitle().startsWith('saved as.ino - '), 'Save As did not update the document path')
  await launchAgain(['saved as.ino'])
  assert.equal(BrowserWindow.getAllWindows().length, 3, 'Save As did not update window tracking')

  await launchAgain(['missing.ino'])
  await until(() => errors.length === 1, 'Missing file did not report an error')
  assert.equal(errors[0].title, 'Unable to open sketch')
  assert.equal(BrowserWindow.getAllWindows().length, 3)
  await expectCode(cold, 'unsavedMarker')

  // Exercise queued OS requests and ensure duplicates do not open extra editors.
  await launchAgain(['empty.ino', 'dialog sketch.ino', 'empty.ino'])
  await windowFor('empty.ino')
  await windowFor('dialog sketch.ino')
  assert.equal(BrowserWindow.getAllWindows().length, 5)
  await launchAgain([])
  assert.equal(BrowserWindow.getAllWindows().length, 5)

  const capture = path.resolve(__dirname, '..', 'outputs', 'file-open-v137.png')
  await fs.mkdir(path.dirname(capture), { recursive: true })
  await fs.writeFile(capture, (await warm.webContents.capturePage()).toPNG())
  await fs.writeFile(path.join(fixtureRoot, 'report.json'), JSON.stringify({
    coldLaunch: true, secondInstance: true, spacesAndUnicode: true,
    preservesUnsavedEdits: true, duplicateFocus: true, emptyFile: true,
    savePath: true, openDialog: true, saveAs: true, missingFile: true,
    multipleFiles: true, screenshot: capture,
  }))
}

if (app.hasSingleInstanceLock()) {
  const watchdog = setTimeout(() => { console.error('File-open tests timed out'); app.exit(1) }, 90000)
  app.whenReady().then(run).then(() => {
    clearTimeout(watchdog)
    app.quit()
  }).catch(async (error) => {
    clearTimeout(watchdog)
    console.error(error)
    for (const window of BrowserWindow.getAllWindows()) {
      console.error(window.getTitle(), await editorText(window).catch(() => 'Editor unavailable'))
    }
    app.exit(1)
  })
}
