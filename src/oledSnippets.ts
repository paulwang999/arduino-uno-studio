import type { Snippet } from './snippets'

const scaffold = {
  include: '#include <Adafruit_SSD1306.h>',
  globals: 'Adafruit_SSD1306 display(128, 64, &Wire, -1);',
  setup: ['if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { while (true) {} }'],
}

export const oledSnippets: Snippet[] = [
  {
    id: 'oled-text', section: 'Libraries', category: 'OLED SSD1306', label: 'OLED text', level: 'Starter',
    description: '128x64 I2C OLED: SDA to A4, SCL to A5, GND to GND. Use a 5V-compatible breakout. Address 0x3C.',
    code: 'display.clearDisplay();\ndisplay.setTextSize(1);\ndisplay.setTextColor(SSD1306_WHITE);\ndisplay.setCursor(0, 0);\ndisplay.println(F("Hello, Arduino!"));\ndisplay.display();',
    referenceUrl: 'https://github.com/adafruit/Adafruit_SSD1306', scaffold,
  },
  {
    id: 'oled-graphics', section: 'Libraries', category: 'OLED SSD1306', label: 'OLED shapes', level: 'Builder',
    description: 'Draw a rectangle, circle and line, then send the pixel buffer to the I2C OLED with display.display().',
    code: 'display.clearDisplay();\ndisplay.drawRect(0, 0, 128, 64, SSD1306_WHITE);\ndisplay.fillCircle(64, 32, 12, SSD1306_WHITE);\ndisplay.drawLine(10, 54, 118, 54, SSD1306_WHITE);\ndisplay.display();',
    referenceUrl: 'https://github.com/adafruit/Adafruit-GFX-Library', scaffold,
  },
]
