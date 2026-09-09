import type { ArduinoExample } from './exampleTypes'
import { oledSnippets } from './oledSnippets.ts'
import { prepareSnippet } from './snippets.ts'

export const oledExamples: ArduinoExample[] = oledSnippets.map((snippet) => ({
  id: `studio:${snippet.id}`, name: snippet.id === 'oled-text' ? 'OLED text and counter' : 'OLED animated shapes',
  fileName: `${snippet.id}.ino`, category: 'Studio Lab', collection: 'Studio Lab', compatibility: 'uno',
  code: '// SSD1306 128x64 I2C: SDA A4, SCL A5, GND GND, VCC 5V (5V-compatible module).\n// Match the display address to 0x3C. A 128x64 framebuffer uses 1024 bytes of Uno RAM.\n' + prepareSnippet('', {
    ...snippet,
    code: snippet.id === 'oled-text'
      ? 'display.clearDisplay();\ndisplay.setTextSize(1);\ndisplay.setTextColor(SSD1306_WHITE);\ndisplay.setCursor(0, 0);\ndisplay.println(F("Hello, Arduino!"));\ndisplay.setCursor(0, 24);\ndisplay.print(F("Seconds: "));\ndisplay.println(millis() / 1000);\ndisplay.display();\ndelay(100);'
      : 'display.clearDisplay();\ndisplay.drawRect(0, 0, 128, 64, SSD1306_WHITE);\nint x = 12 + (millis() / 20) % 104;\ndisplay.fillCircle(x, 32, 10, SSD1306_WHITE);\ndisplay.display();\ndelay(30);',
  }, 0).code,
}))
