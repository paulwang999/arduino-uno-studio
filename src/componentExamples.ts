import { componentSnippets } from './componentSnippets.ts'
import { prepareSnippet } from './snippets.ts'
import type { ArduinoExample } from './exampleTypes'

const readings: Record<string, string> = {
  'pir-motion': 'digitalWrite(LED_BUILTIN, motionDetected ? HIGH : LOW);\nSerial.println(motionDetected);',
  'ntc-temperature': 'Serial.print(temperatureC, 1);\nSerial.println(" C");',
  'slide-switch-read': 'digitalWrite(LED_BUILTIN, switchOn ? HIGH : LOW);\nSerial.println(switchOn);',
  'joystick-read': 'Serial.print(joystickX);\nSerial.print(", ");\nSerial.print(joystickY);\nSerial.print(", ");\nSerial.println(joystickPressed);',
  'rgb-color': '',
}

export const componentExamples: ArduinoExample[] = componentSnippets.map((snippet) => {
  const rgb = snippet.id === 'rgb-color'
  const code = rgb
    ? 'int colorPhase = (millis() / 1000) % 3;\nanalogWrite(redPin, colorPhase == 0 ? 255 : 0);\nanalogWrite(greenPin, colorPhase == 1 ? 255 : 0);\nanalogWrite(bluePin, colorPhase == 2 ? 255 : 0);\ndelay(20);'
    : `${snippet.code}\n${readings[snippet.id]}\ndelay(100);`
  const prepared = prepareSnippet('', {
    ...snippet,
    code,
    scaffold: {
      ...snippet.scaffold,
      setup: [...(snippet.scaffold?.setup || []), ...(rgb ? [] : ['Serial.begin(9600);', 'pinMode(LED_BUILTIN, OUTPUT);'])],
    },
  }, 0)
  return {
    id: `studio:${snippet.id}`, name: snippet.label, fileName: `${snippet.id}.ino`,
    category: 'Studio Lab', collection: 'Studio Lab', compatibility: 'uno',
    code: `// ${snippet.description}\n${prepared.code}`,
  }
})
