const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('arduinoDesktop', {
  getRuntimeStatus: () => ipcRenderer.invoke('runtime:status'),
  compile: (code) => ipcRenderer.invoke('sketch:compile', code),
  listHardwarePorts: () => ipcRenderer.invoke('hardware:list'),
  uploadToUno: (payload) => ipcRenderer.invoke('hardware:upload', payload),
  startHardwareSerial: (payload) => ipcRenderer.invoke('hardware:serial-start', payload),
  stopHardwareSerial: () => ipcRenderer.invoke('hardware:serial-stop'),
  writeHardwareSerial: (text) => ipcRenderer.invoke('hardware:serial-write', text),
  onHardwareSerial: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('hardware:serial-event', listener)
    return () => ipcRenderer.removeListener('hardware:serial-event', listener)
  },
  openSketch: () => ipcRenderer.invoke('sketch:open'),
  getInitialSketch: () => ipcRenderer.invoke('sketch:initial'),
  setSketchPath: (filePath) => ipcRenderer.invoke('sketch:set-path', filePath),
  saveSketch: (payload) => ipcRenderer.invoke('sketch:save', payload),
  openExternal: (url) => ipcRenderer.invoke('link:open', url),
  platform: process.platform,
})
