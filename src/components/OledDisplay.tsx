import { useEffect, useRef } from 'react'

export function OledDisplay({ frame, preview = false }: { frame?: Uint8Array; preview?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    const image = context.createImageData(128, 64)
    for (let index = 0; index < 8192; index++) {
      const light = frame?.[index] || 0
      image.data[index * 4] = light
      image.data[index * 4 + 1] = light
      image.data[index * 4 + 2] = light
      image.data[index * 4 + 3] = 255
    }
    context.putImageData(image, 0, 0)
    if (preview) {
      context.fillStyle = '#ffffff'
      context.font = '20px monospace'
      context.textAlign = 'center'
      context.fillText('OLED', 64, 30)
      context.font = '10px monospace'
      context.fillText('128 x 64', 64, 49)
    }
  }, [frame, preview])
  return <span className="oled-board"><canvas ref={canvas} width={128} height={64} aria-label="SSD1306 OLED display pixels" /></span>
}

export function OledAddress({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <label className="oled-address">I2C<select aria-label="OLED I2C address" value={value} onChange={(event) => onChange(Number(event.target.value))}>
    <option value={60}>0x3C</option><option value={61}>0x3D</option>
  </select></label>
}
