type RuntimeStatus = { ready: boolean; version: string; message: string }
type CompileResult = { ok: boolean; stdout: string; stderr: string; hex: string }
type SketchFile = { filePath: string; name: string; code?: string }
type HardwarePort = {
  address: string
  label: string
  protocol: string
  protocolLabel: string
  boardName: string
  fqbn: string
  isUno: boolean
}
type HardwareListResult = { ok: boolean; ports: HardwarePort[]; message: string }
type HardwareActionResult = { ok: boolean; message?: string; stdout?: string; stderr?: string }
type HardwareSerialEvent =
  | { type: 'data'; text: string }
  | { type: 'error'; message: string }
  | { type: 'status'; status: 'connected' | 'disconnected'; message: string }

interface Window {
  arduinoDesktop: {
    getRuntimeStatus: () => Promise<RuntimeStatus>
    compile: (code: string) => Promise<CompileResult>
    listHardwarePorts: () => Promise<HardwareListResult>
    uploadToUno: (payload: { code: string; port: string }) => Promise<HardwareActionResult>
    startHardwareSerial: (payload: { port: string; baudRate: number }) => Promise<HardwareActionResult>
    stopHardwareSerial: () => Promise<HardwareActionResult>
    writeHardwareSerial: (text: string) => Promise<HardwareActionResult>
    onHardwareSerial: (callback: (event: HardwareSerialEvent) => void) => () => void
    openSketch: () => Promise<SketchFile | null>
    getInitialSketch: () => Promise<SketchFile | null>
    setSketchPath: (filePath: string | null) => Promise<void>
    saveSketch: (payload: { filePath: string | null; code: string }) => Promise<SketchFile | null>
    openExternal: (url: string) => Promise<void>
    platform: string
  }
}
