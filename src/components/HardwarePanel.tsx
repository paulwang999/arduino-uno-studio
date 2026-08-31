import { Cable, RefreshCw, Send, Trash2, Unplug, Upload, Usb } from 'lucide-react'
import { useState } from 'react'
import { ConsoleOutput } from './ConsoleOutput'

const baudRates = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 250000, 500000, 1000000, 2000000]

type HardwarePanelProps = {
  ports: HardwarePort[]
  selectedPort: string
  scanning: boolean
  connectionMessage: string
  uploading: boolean
  uploadOutput: string
  serialConnected: boolean
  serialConnecting: boolean
  serialStatus: string
  serialOutput: string
  onSelectPort: (port: string) => void
  onRefresh: () => void
  onUpload: () => void
  onConnectSerial: (baudRate: number) => void
  onDisconnectSerial: () => void
  onSendSerial: (text: string) => void
  onClearSerial: () => void
}

export function HardwarePanel({
  ports,
  selectedPort,
  scanning,
  connectionMessage,
  uploading,
  uploadOutput,
  serialConnected,
  serialConnecting,
  serialStatus,
  serialOutput,
  onSelectPort,
  onRefresh,
  onUpload,
  onConnectSerial,
  onDisconnectSerial,
  onSendSerial,
  onClearSerial,
}: HardwarePanelProps) {
  const [baudRate, setBaudRate] = useState(9600)
  const [serialInput, setSerialInput] = useState('')
  const selectedDevice = ports.find((port) => port.address === selectedPort)

  function sendLine() {
    if (!serialInput || !serialConnected) return
    onSendSerial(`${serialInput}\n`)
    setSerialInput('')
  }

  return <div className="hardware-content">
    <section className="hardware-connection">
      <header>
        <span className={selectedDevice ? 'connected' : ''} />
        <strong>ARDUINO UNO USB</strong>
        <button type="button" title="Refresh USB devices" onClick={onRefresh} disabled={scanning}><RefreshCw className={scanning ? 'spinning' : ''} /></button>
      </header>
      <div className="hardware-port-row">
        <label>
          <span>PORT</span>
          <select data-hardware-port value={selectedPort} onChange={(event) => onSelectPort(event.target.value)} disabled={ports.length === 0}>
            {ports.length === 0 && <option value="">No USB serial device</option>}
            {ports.map((port) => <option value={port.address} key={port.address}>{port.address} · {port.boardName}</option>)}
          </select>
        </label>
        <button data-hardware-upload className="hardware-upload-button" type="button" disabled={!selectedDevice || uploading} onClick={onUpload}>
          <Upload />{uploading ? 'Uploading' : 'Upload to Uno'}
        </button>
      </div>
      <div className="hardware-device-status">
        <Usb aria-hidden="true" />
        <span><strong>{selectedDevice?.boardName || 'No board detected'}</strong><small>{selectedDevice ? `${selectedDevice.label} · ${selectedDevice.protocolLabel}` : connectionMessage}</small></span>
        {selectedDevice && <em className={selectedDevice.isUno ? 'uno' : ''}>{selectedDevice.isUno ? 'UNO' : 'UNO TARGET'}</em>}
      </div>
      <ConsoleOutput className="hardware-upload-output" text={uploadOutput || 'Upload output will appear here.'} />
    </section>

    <section className="hardware-serial">
      <header>
        <span className={serialConnected ? 'connected' : ''} />
        <strong>USB SERIAL</strong>
        <select aria-label="Hardware serial baud rate" value={baudRate} disabled={serialConnected || serialConnecting} onChange={(event) => setBaudRate(Number(event.target.value))}>
          {baudRates.map((rate) => <option value={rate} key={rate}>{rate} baud</option>)}
        </select>
        {serialConnected ? <button data-hardware-serial-disconnect type="button" title="Disconnect USB Serial" onClick={onDisconnectSerial}><Unplug />Disconnect</button> : <button data-hardware-serial-connect type="button" title="Connect USB Serial" disabled={!selectedDevice || serialConnecting} onClick={() => onConnectSerial(baudRate)}><Cable />{serialConnecting ? 'Connecting' : 'Connect'}</button>}
        <button className="hardware-clear-button" type="button" title="Clear USB Serial output" onClick={onClearSerial}><Trash2 /></button>
      </header>
      <div data-hardware-serial-status className="hardware-serial-status">{serialStatus}</div>
      <pre data-hardware-serial-output>{serialOutput || 'USB Serial output will appear here.'}</pre>
      <div className="hardware-serial-input">
        <input
          data-hardware-serial-input
          value={serialInput}
          disabled={!serialConnected}
          placeholder="Send text to Arduino Uno"
          onChange={(event) => setSerialInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') sendLine() }}
        />
        <button type="button" title="Send serial line" disabled={!serialConnected || !serialInput} onClick={sendLine}><Send /></button>
      </div>
    </section>
  </div>
}
