const allowedBaudRates = new Set([300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 250000, 500000, 1000000, 2000000])

function parseDetectedPorts(output) {
  const parsed = JSON.parse(String(output || '{}'))
  const detected = Array.isArray(parsed.detected_ports) ? parsed.detected_ports : []
  return detected.map((entry) => {
    const port = entry.port || {}
    const boards = Array.isArray(entry.matching_boards) ? entry.matching_boards : []
    const board = boards[0] || {}
    return {
      address: String(port.address || ''),
      label: String(port.label || port.address || 'Serial port'),
      protocol: String(port.protocol || ''),
      protocolLabel: String(port.protocol_label || port.protocol || ''),
      boardName: String(board.name || 'Unknown Arduino-compatible board'),
      fqbn: String(board.fqbn || ''),
      isUno: board.fqbn === 'arduino:avr:uno' || /arduino\s+uno/i.test(String(board.name || '')),
    }
  }).filter((port) => port.address && (!port.protocol || port.protocol === 'serial'))
}

function normalizePortAddress(value, allowMock = false) {
  const address = String(value || '').trim().toUpperCase()
  if (allowMock && address === 'COM_TEST') return address
  if (!/^COM\d{1,4}$/.test(address)) throw new Error('Select a valid Windows COM port.')
  return address
}

function normalizeBaudRate(value) {
  const baudRate = Number(value)
  if (!allowedBaudRates.has(baudRate)) throw new Error('Select a supported serial baud rate.')
  return baudRate
}

function uploadArguments(port, inputDir) {
  return ['upload', '--fqbn', 'arduino:avr:uno', '--port', port, '--input-dir', inputDir, '--verify']
}

function monitorArguments(port, baudRate) {
  return ['monitor', '--port', port, '--fqbn', 'arduino:avr:uno', '--config', `baudrate=${baudRate}`, '--quiet']
}

module.exports = {
  monitorArguments,
  normalizeBaudRate,
  normalizePortAddress,
  parseDetectedPorts,
  uploadArguments,
}
