const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

app.whenReady().then(async () => {
  const root = path.join(__dirname, '..')
  const svg = fs.readFileSync(path.join(root, 'build', 'icon.svg'), 'utf8')
  const window = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, useContentSize: true })
  const html = `<style>*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden}svg{display:block;width:512px;height:512px}</style>${svg}`
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  const image = await window.webContents.capturePage()
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), image.toPNG())
  window.destroy()
  app.quit()
})
