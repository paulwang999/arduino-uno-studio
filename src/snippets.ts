import { componentSnippets } from './componentSnippets.ts'
import { oledSnippets } from './oledSnippets.ts'

export type SnippetSection = 'Functions' | 'Variables' | 'Structure' | 'Libraries'
export type SnippetLevel = 'Starter' | 'Builder' | 'Challenge'

export type Snippet = {
  id: string
  section: SnippetSection
  category: string
  label: string
  level: SnippetLevel
  description: string
  code: string
  referenceUrl: string
  scaffold?: {
    include?: string
    globals?: string
    setup?: string[]
  }
}

export const snippets: Snippet[] = [
  {
    id: 'pin-mode', section: 'Functions', category: 'Digital I/O', label: 'pinMode', level: 'Starter',
    description: 'Configure a digital pin as an input or output.',
    code: 'pinMode(LED_BUILTIN, OUTPUT);',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/functions/digital-io/pinMode/',
  },
  {
    id: 'digital-write', section: 'Functions', category: 'Digital I/O', label: 'digitalWrite', level: 'Starter',
    description: 'Set a digital output pin HIGH or LOW.',
    code: 'digitalWrite(LED_BUILTIN, HIGH);',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/functions/digital-io/digitalwrite/',
    scaffold: { setup: ['pinMode(LED_BUILTIN, OUTPUT);'] },
  },
  {
    id: 'digital-read', section: 'Functions', category: 'Digital I/O', label: 'digitalRead', level: 'Starter',
    description: 'Read HIGH or LOW from a digital input.',
    code: 'int buttonState = digitalRead(2);',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/functions/digital-io/digitalread/',
    scaffold: { setup: ['pinMode(2, INPUT_PULLUP);'] },
  },
  {
    id: 'analog-read', section: 'Functions', category: 'Analog I/O', label: 'analogRead', level: 'Starter',
    description: 'Read a value from 0 to 1023 on an analog input.',
    code: 'int sensorValue = analogRead(A0);',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/functions/analog-io/analogRead/',
  },
  {
    id: 'ultrasonic-distance', section: 'Functions', category: 'Advanced I/O', label: 'Sonar distance', level: 'Starter',
    description: 'Read HC-SR04 distance in centimetres with one sonar.ping command. Trigger is D7 and Echo is D6.',
    code: 'int distance = sonar.ping(trigPin, echoPin);',
    referenceUrl: 'https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf',
    scaffold: {
      include: '#include <StudioSonar.h>',
      globals: 'const int trigPin = 7;\nconst int echoPin = 6;',
    },
  },
  {
    id: 'analog-write', section: 'Functions', category: 'Analog I/O', label: 'analogWrite', level: 'Builder',
    description: 'Write a PWM value from 0 to 255.',
    code: 'analogWrite(9, 128);',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/functions/analog-io/analogWrite/',
  },
  {
    id: 'delay', section: 'Functions', category: 'Time', label: 'delay', level: 'Starter',
    description: 'Pause the sketch for a number of milliseconds.',
    code: 'delay(500);',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/functions/time/delay/',
  },
  {
    id: 'millis', section: 'Functions', category: 'Time', label: 'millis', level: 'Builder',
    description: 'Read the milliseconds since the sketch started.',
    code: 'unsigned long now = millis();',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/functions/time/millis/',
  },
  {
    id: 'map', section: 'Functions', category: 'Math', label: 'map', level: 'Builder',
    description: 'Convert a value from one range to another.',
    code: 'int outputValue = map(sensorValue, 0, 1023, 0, 255);',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/functions/math/map/',
  },
  {
    id: 'constrain', section: 'Functions', category: 'Math', label: 'constrain', level: 'Builder',
    description: 'Keep a value between a minimum and maximum.',
    code: 'value = constrain(value, 0, 255);',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/functions/math/constrain/',
  },
  {
    id: 'tone', section: 'Functions', category: 'Advanced I/O', label: 'tone / noTone', level: 'Builder',
    description: 'Play and stop a frequency on the D8 buzzer.',
    code: 'tone(8, 440, 250);\ndelay(300);\nnoTone(8);',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/functions/advanced-io/tone/',
  },
  {
    id: 'serial-begin', section: 'Functions', category: 'Communication', label: 'Serial.begin', level: 'Starter',
    description: 'Start the Serial Monitor connection.',
    code: 'Serial.begin(9600);',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/functions/communication/serial/begin/',
  },
  {
    id: 'serial-println', section: 'Functions', category: 'Communication', label: 'Serial.println', level: 'Starter',
    description: 'Print a value followed by a new line.',
    code: 'Serial.println("Hello from Arduino");',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/functions/communication/serial/println/',
    scaffold: { setup: ['Serial.begin(9600);'] },
  },
  {
    id: 'int', section: 'Variables', category: 'Data Types', label: 'int variable', level: 'Starter',
    description: 'Store a whole number.', code: 'int value = 0;',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/variables/data-types/int/',
  },
  {
    id: 'bool', section: 'Variables', category: 'Data Types', label: 'bool variable', level: 'Starter',
    description: 'Store a true or false state.', code: 'bool isOn = false;',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/variables/data-types/bool/',
  },
  {
    id: 'const', section: 'Variables', category: 'Qualifiers', label: 'const pin', level: 'Starter',
    description: 'Create a value that cannot be changed.', code: 'const int ledPin = LED_BUILTIN;',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/variables/variable-scope-qualifiers/const/',
  },
  {
    id: 'setup-loop', section: 'Structure', category: 'Sketch', label: 'setup and loop', level: 'Starter',
    description: 'Create the two functions used by every Arduino sketch.',
    code: 'void setup() {\n  // Runs once\n}\n\nvoid loop() {\n  // Repeats forever\n}',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/structure/sketch/setup/',
  },
  {
    id: 'if-else', section: 'Structure', category: 'Control', label: 'if / else', level: 'Starter',
    description: 'Choose code using a true or false condition.',
    code: 'if (sensorValue > 500) {\n  digitalWrite(LED_BUILTIN, HIGH);\n} else {\n  digitalWrite(LED_BUILTIN, LOW);\n}',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/structure/control-structure/if/',
    scaffold: { setup: ['pinMode(LED_BUILTIN, OUTPUT);'] },
  },
  {
    id: 'for', section: 'Structure', category: 'Control', label: 'for loop', level: 'Builder',
    description: 'Repeat code a fixed number of times.',
    code: 'for (int count = 0; count < 5; count++) {\n  delay(200);\n}',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/structure/control-structure/for/',
  },
  {
    id: 'while', section: 'Structure', category: 'Control', label: 'while loop', level: 'Builder',
    description: 'Repeat code while a condition remains true.',
    code: 'int count = 0;\n\nwhile (count < 5) {\n  count++;\n}',
    referenceUrl: 'https://docs.arduino.cc/language-reference/en/structure/control-structure/while/',
  },
  {
    id: 'ws2812-solid', section: 'Libraries', category: 'FastLED', label: 'WS2812B solid color', level: 'Starter',
    description: 'Set every LED on a WS2812B strip to the same color.',
    code: 'fill_solid(stripLeds, LED_COUNT, CRGB::Blue);\nFastLED.show();',
    referenceUrl: 'https://fastled.io/docs/',
    scaffold: {
      include: '#include <FastLED.h>',
      globals: '#define LED_STRIP_PIN 6\n#define LED_COUNT 8\nCRGB stripLeds[LED_COUNT];',
      setup: ['FastLED.addLeds<WS2812B, LED_STRIP_PIN, GRB>(stripLeds, LED_COUNT);', 'FastLED.setBrightness(80);'],
    },
  },
  {
    id: 'ws2812-rainbow', section: 'Libraries', category: 'FastLED', label: 'WS2812B rainbow', level: 'Builder',
    description: 'Animate a moving rainbow across a WS2812B strip.',
    code: 'static uint8_t hue = 0;\nfill_rainbow(stripLeds, LED_COUNT, hue++);\nFastLED.show();\ndelay(30);',
    referenceUrl: 'https://fastled.io/docs/',
    scaffold: {
      include: '#include <FastLED.h>',
      globals: '#define LED_STRIP_PIN 6\n#define LED_COUNT 8\nCRGB stripLeds[LED_COUNT];',
      setup: ['FastLED.addLeds<WS2812B, LED_STRIP_PIN, GRB>(stripLeds, LED_COUNT);', 'FastLED.setBrightness(80);'],
    },
  },
  {
    id: 'servo-write', section: 'Libraries', category: 'Servo', label: 'Servo write', level: 'Starter',
    description: 'Attach a servo to D9 and move it to an angle.', code: 'myServo.write(90);',
    referenceUrl: 'https://docs.arduino.cc/libraries/servo/',
    scaffold: { include: '#include <Servo.h>', globals: 'Servo myServo;', setup: ['myServo.attach(9);'] },
  },
  {
    id: 'servo-sweep', section: 'Libraries', category: 'Servo', label: 'Servo sweep', level: 'Builder',
    description: 'Sweep a servo from 0 to 180 degrees.',
    code: 'for (int angle = 0; angle <= 180; angle++) {\n  myServo.write(angle);\n  delay(15);\n}',
    referenceUrl: 'https://docs.arduino.cc/libraries/servo/',
    scaffold: { include: '#include <Servo.h>', globals: 'Servo myServo;', setup: ['myServo.attach(9);'] },
  },
  {
    id: 'lcd', section: 'Libraries', category: 'LiquidCrystal', label: 'LCD print', level: 'Builder',
    description: 'Print a message on a standard 16x2 LCD.',
    code: 'lcd.clear();\nlcd.setCursor(0, 0);\nlcd.print("Hello, Arduino!");',
    referenceUrl: 'https://docs.arduino.cc/libraries/liquidcrystal/',
    scaffold: { include: '#include <LiquidCrystal.h>', globals: 'LiquidCrystal lcd(12, 11, 5, 4, 3, 2);', setup: ['lcd.begin(16, 2);'] },
  },
  {
    id: 'stepper', section: 'Libraries', category: 'Stepper', label: 'Stepper turn', level: 'Builder',
    description: 'Turn a four-wire stepper motor one revolution.',
    code: 'myStepper.step(stepsPerRevolution);',
    referenceUrl: 'https://docs.arduino.cc/libraries/stepper/',
    scaffold: { include: '#include <Stepper.h>', globals: 'const int stepsPerRevolution = 200;\nStepper myStepper(stepsPerRevolution, 8, 9, 10, 11);', setup: ['myStepper.setSpeed(60);'] },
  },
  {
    id: 'eeprom', section: 'Libraries', category: 'EEPROM', label: 'EEPROM save', level: 'Builder',
    description: 'Save one byte in non-volatile memory.', code: 'EEPROM.update(0, 42);',
    referenceUrl: 'https://docs.arduino.cc/learn/built-in-libraries/eeprom/',
    scaffold: { include: '#include <EEPROM.h>' },
  },
  {
    id: 'sd', section: 'Libraries', category: 'SD', label: 'SD write line', level: 'Challenge',
    description: 'Open a file on an SD card and append a line.',
    code: 'File logFile = SD.open("data.txt", FILE_WRITE);\nif (logFile) {\n  logFile.println("Arduino data");\n  logFile.close();\n}',
    referenceUrl: 'https://docs.arduino.cc/libraries/sd/',
    scaffold: { include: '#include <SD.h>', globals: 'const int chipSelectPin = 10;', setup: ['SD.begin(chipSelectPin);'] },
  },
  ...componentSnippets,
  ...oledSnippets,
]

export function prepareSnippet(source: string, snippet: Snippet, insertionOffset: number) {
  if (!source.trim() && snippet.scaffold) {
    const header = [snippet.scaffold.include, snippet.scaffold.globals].filter(Boolean).join('\n\n')
    const setupBody = (snippet.scaffold.setup ?? []).map((line) => `  ${line}`).join('\n')
    const snippetBody = snippet.code.split('\n').map((line) => `  ${line}`).join('\n')
    const setupBlock = `void setup() {\n${setupBody}${setupBody ? '\n' : ''}}`
    const loopPrefix = `${header ? `${header}\n\n` : ''}${setupBlock}\n\nvoid loop() {\n`
    const code = `${loopPrefix}${snippetBody}\n}\n`
    return { code, cursor: loopPrefix.length + snippetBody.length + 1 }
  }

  let code = source
  let offset = insertionOffset

  const insertAt = (index: number, text: string) => {
    code = `${code.slice(0, index)}${text}${code.slice(index)}`
    if (index <= offset) offset += text.length
  }

  if (snippet.scaffold?.include && !code.includes(snippet.scaffold.include)) {
    insertAt(0, `${snippet.scaffold.include}\n\n`)
  }

  if (snippet.scaffold?.globals) {
    const missing = snippet.scaffold.globals.split('\n').filter((line) => line.trim() && !code.includes(line.trim()))
    if (missing.length) {
      const setupIndex = code.search(/\bvoid\s+setup\s*\(/)
      const includeMatches = [...code.matchAll(/^[ \t]*#include[^\r\n]*(?:\r?\n|$)/gm)]
      const lastInclude = includeMatches.at(-1)
      const afterIncludes = lastInclude ? (lastInclude.index ?? 0) + lastInclude[0].length : 0
      insertAt(setupIndex >= 0 ? setupIndex : afterIncludes, `${missing.join('\n')}\n\n`)
    }
  }

  const setupMatch = /\bvoid\s+setup\s*\([^)]*\)\s*\{/.exec(code)
  if (snippet.scaffold?.setup && setupMatch) {
    const missing = snippet.scaffold.setup.filter((line) => !code.replace(/\s+/g, ' ').includes(line.replace(/\s+/g, ' ')))
    if (missing.length) {
      const setupCode = missing.map((line) => `\n  ${line}`).join('')
      insertAt((setupMatch.index ?? 0) + setupMatch[0].length, setupCode)
    }
  }

  const prefix = offset > 0 && code[offset - 1] !== '\n' ? '\n' : ''
  const insertion = `${prefix}${snippet.code}\n`
  return { code: `${code.slice(0, offset)}${insertion}${code.slice(offset)}`, cursor: offset + insertion.length }
}
