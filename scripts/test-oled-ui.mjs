import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { _electron } = require(process.env.STUDIO_PLAYWRIGHT || 'playwright')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profile = await mkdtemp(path.join(os.tmpdir(), 'studio-oled-ui-'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.VITE_DEV_SERVER_URL
delete env.ARDUINO_STUDIO_SMOKE_TEST
const app = await _electron.launch({ executablePath: process.env.STUDIO_EXE || require('electron'), args: [...(process.env.STUDIO_EXE ? [] : [root]), `--user-data-dir=${profile}`], env })
try {
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 960))
  await page.locator('.monaco-editor').waitFor()
  await page.getByTitle('Add component', { exact: true }).click()
  await page.getByPlaceholder('Search components').fill('oled')
  const preview = page.locator('[data-catalog-id="oled"] canvas')
  assert.ok(await preview.evaluate((canvas) => canvas.getContext('2d').getImageData(0, 0, 128, 64).data.some((value, index) => index % 4 !== 3 && value > 0)))
  await page.locator('[data-catalog-id="oled"]').click()
  assert.equal(await page.locator('[data-component="oled"]').count(), 1)
  assert.equal(await page.locator('.wire-hit[data-wire-from^="oled-1:"]').count(), 4)
  await page.locator('[data-toolbox-category="output"]').click()
  for (const id of ['oled-text', 'oled-graphics']) assert.equal(await page.locator(`[data-snippet-id="${id}"]`).count(), 1)
  const before = await page.locator('.view-lines').innerText()
  await page.locator('[data-snippet-id="oled-text"]').click()
  assert.equal(await page.locator('.view-lines').innerText(), before)
  const data = await page.evaluateHandle(() => { const transfer = new DataTransfer(); transfer.setData('application/x-arduino-snippet', 'oled-text'); return transfer })
  await page.locator('.monaco-editor').dispatchEvent('drop', { dataTransfer: data })
  await page.waitForFunction(() => document.querySelector('.view-lines').textContent.includes('Adafruit_SSD1306'))
  await page.getByRole('button', { name: 'Examples', exact: true }).click()
  await page.locator('[data-example-id="studio:oled-text"]').click()
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const canvas = page.locator('[data-component="oled"] canvas')
  const pixels = () => canvas.evaluate((element) => Array.from(element.getContext('2d').getImageData(0, 0, 128, 64).data).filter((_, index) => index % 4 === 0))
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-component="oled"] canvas')
    return element && element.getContext('2d').getImageData(0, 0, 128, 64).data.some((value, index) => index % 4 === 0 && value > 0)
  }, undefined, { timeout: 60000 })
  const first = await pixels()
  assert.ok(first.filter(Boolean).length > 100)
  await page.waitForFunction((previous) => {
    const element = document.querySelector('[data-component="oled"] canvas')
    const pixels = element.getContext('2d').getImageData(0, 0, 128, 64).data
    return previous.some((value, index) => value !== pixels[index * 4])
  }, first, { timeout: 20000 })
  assert.notDeepEqual(await pixels(), first, 'Counter did not change')
  await mkdir(path.join(root, 'outputs'), { recursive: true })
  await page.screenshot({ path: path.join(root, 'outputs', 'oled-1.5.0-desktop.png') })
  await page.getByTitle('Maximize circuit', { exact: true }).click()
  const heading = page.locator('[data-component="oled"] .circuit-node-heading')
  const from = await heading.boundingBox()
  await page.mouse.move(from.x + 12, from.y + 8)
  await page.mouse.down()
  await page.mouse.move(from.x + 75, from.y + 20, { steps: 5 })
  await page.mouse.up()
  assert.notEqual((await heading.boundingBox()).x, from.x)
  await page.locator('.wire-hit[data-wire-from="oled-1:VCC"]').dispatchEvent('click')
  await page.getByTitle('Delete wire', { exact: true }).click()
  await page.waitForTimeout(150)
  assert.equal((await pixels()).some(Boolean), false, 'Unpowered OLED still emits light')
  await page.locator('[data-terminal-id="oled-1:VCC"]').click()
  await page.locator('[data-terminal-id="uno:5V"]').click()
  await page.getByTitle('Close wire editor').click()
  await page.getByTitle('Restore workspace').click()
  await page.getByRole('button', { name: 'Restart', exact: true }).click()
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-component="oled"] canvas')
    return element.getContext('2d').getImageData(0, 0, 128, 64).data.some((value, index) => index % 4 === 0 && value > 0)
  }, undefined, { timeout: 60000 })
  assert.ok((await pixels()).some(Boolean))
  await page.getByLabel('OLED I2C address', { exact: true }).selectOption('61')
  await page.getByRole('button', { name: 'Restart', exact: true }).click()
  await page.waitForTimeout(1000)
  assert.equal((await pixels()).some(Boolean), false)
  await page.getByLabel('OLED I2C address', { exact: true }).selectOption('60')
  await page.getByRole('button', { name: 'Examples', exact: true }).click()
  await page.locator('[data-example-id="studio:oled-graphics"]').click()
  await page.getByRole('button', { name: /^(Run|Restart)$/ }).click()
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-component="oled"] canvas')
    return element && element.getContext('2d').getImageData(0, 0, 128, 64).data.some((value, index) => index % 4 === 0 && value > 0)
  }, undefined, { timeout: 60000 })
  assert.ok((await pixels()).some(Boolean))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 780))
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(root, 'outputs', 'oled-1.5.0-compact.png') })
  await page.getByRole('button', { name: 'Uno Lab', exact: true }).click()
  assert.ok(await page.locator('.lab-sensor canvas').evaluate((element) => element.getContext('2d').getImageData(0, 0, 128, 64).data.some((value, index) => index % 4 === 0 && value > 0)))
  assert.deepEqual(errors, [])
  console.log('OLED UI tests passed: catalog, drag-only code, examples, changing canvas pixels, wiring/power/address, dragging, Uno Lab and two viewport sizes.')
} finally {
  await app.close()
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
