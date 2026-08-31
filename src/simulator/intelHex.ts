export function loadIntelHex(source: string, target: Uint8Array) {
  let upperAddress = 0

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (!line.startsWith(':')) throw new Error('Invalid Intel HEX record.')

    const bytes = new Uint8Array((line.length - 1) / 2)
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(line.slice(index * 2 + 1, index * 2 + 3), 16)
    }

    const byteCount = bytes[0]
    const address = (bytes[1] << 8) | bytes[2]
    const recordType = bytes[3]
    const checksum = bytes.reduce((sum, value) => (sum + value) & 0xff, 0)
    if (checksum !== 0) throw new Error('Intel HEX checksum failed.')

    if (recordType === 0) {
      const absoluteAddress = upperAddress + address
      target.set(bytes.subarray(4, 4 + byteCount), absoluteAddress)
    } else if (recordType === 4) {
      upperAddress = (((bytes[4] << 8) | bytes[5]) << 16) >>> 0
    } else if (recordType === 1) {
      break
    }
  }
}
