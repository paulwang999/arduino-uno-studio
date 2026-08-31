import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  monitorArguments,
  normalizeBaudRate,
  normalizePortAddress,
  parseDetectedPorts,
  uploadArguments,
} = require('../electron/hardware.cjs')

const ports = parseDetectedPorts(JSON.stringify({
  detected_ports: [
    {
      port: { address: 'COM7', label: 'Arduino Uno', protocol: 'serial', protocol_label: 'Serial Port (USB)' },
      matching_boards: [{ name: 'Arduino Uno', fqbn: 'arduino:avr:uno' }],
    },
    {
      port: { address: '192.168.1.4', label: 'Network board', protocol: 'network' },
      matching_boards: [],
    },
  ],
}))

assert.equal(ports.length, 1)
assert.deepEqual(ports[0], {
  address: 'COM7',
  label: 'Arduino Uno',
  protocol: 'serial',
  protocolLabel: 'Serial Port (USB)',
  boardName: 'Arduino Uno',
  fqbn: 'arduino:avr:uno',
  isUno: true,
})
assert.equal(normalizePortAddress('com12'), 'COM12')
assert.throws(() => normalizePortAddress('COM3 & calc.exe'))
assert.equal(normalizeBaudRate('115200'), 115200)
assert.throws(() => normalizeBaudRate(12345))
assert.deepEqual(uploadArguments('COM7', 'C:\\build'), [
  'upload', '--fqbn', 'arduino:avr:uno', '--port', 'COM7', '--input-dir', 'C:\\build', '--verify',
])
assert.deepEqual(monitorArguments('COM7', 9600), [
  'monitor', '--port', 'COM7', '--fqbn', 'arduino:avr:uno', '--config', 'baudrate=9600', '--quiet',
])

console.log('Hardware command and port parsing tests passed.')
