import type { Snippet } from './snippets'

export const componentSnippets: Snippet[] = [
  {
    id: 'pir-motion', section: 'Functions', category: 'Digital I/O', label: 'PIR motion', level: 'Starter',
    description: 'Read motion from a PIR module. VCC to 5V, OUT to D4, GND to GND.',
    code: 'bool motionDetected = digitalRead(pirPin) == HIGH;',
    referenceUrl: 'https://docs.wokwi.com/parts/wokwi-pir-motion-sensor',
    scaffold: { globals: 'const int pirPin = 4;', setup: ['pinMode(pirPin, INPUT);'] },
  },
  {
    id: 'ntc-temperature', section: 'Functions', category: 'Analog I/O', label: 'NTC temperature', level: 'Builder',
    description: 'Read Celsius from a 10K NTC + 10K resistor module (beta 3950). OUT to A0; 5V supply.',
    code: 'int temperatureRaw = constrain(analogRead(temperaturePin), 1, 1022);\nfloat thermistorOhms = 10000.0 * temperatureRaw / (1023.0 - temperatureRaw);\nfloat temperatureC = 1.0 / (1.0 / 298.15 + log(thermistorOhms / 10000.0) / 3950.0) - 273.15;',
    referenceUrl: 'https://docs.wokwi.com/parts/wokwi-ntc-temperature-sensor',
    scaffold: { globals: 'const int temperaturePin = A0;' },
  },
  {
    id: 'slide-switch-read', section: 'Functions', category: 'Digital I/O', label: 'Slide switch', level: 'Starter',
    description: 'Read an SPDT switch: common 2 to D2, terminal 1 to GND, terminal 3 to 5V.',
    code: 'bool switchOn = digitalRead(switchPin) == HIGH;',
    referenceUrl: 'https://docs.wokwi.com/parts/wokwi-slide-switch',
    scaffold: { globals: 'const int switchPin = 2;', setup: ['pinMode(switchPin, INPUT_PULLUP);'] },
  },
  {
    id: 'joystick-read', section: 'Functions', category: 'Analog I/O', label: 'Joystick axes + button', level: 'Starter',
    description: 'Read HORZ (A0), VERT (A1) and SEL (D2). Center is about 512; pressed is LOW.',
    code: 'int joystickX = analogRead(joystickXPin);\nint joystickY = analogRead(joystickYPin);\nbool joystickPressed = digitalRead(joystickButtonPin) == LOW;',
    referenceUrl: 'https://docs.wokwi.com/parts/wokwi-analog-joystick',
    scaffold: { globals: 'const int joystickXPin = A0;\nconst int joystickYPin = A1;\nconst int joystickButtonPin = 2;', setup: ['pinMode(joystickButtonPin, INPUT_PULLUP);'] },
  },
  {
    id: 'rgb-color', section: 'Functions', category: 'Analog I/O', label: 'RGB LED color', level: 'Starter',
    description: 'Common cathode RGB LED: COM to GND; R, G, B to D9, D10, D11 through one 220-ohm resistor each.',
    code: 'analogWrite(redPin, 255);\nanalogWrite(greenPin, 80);\nanalogWrite(bluePin, 0);',
    referenceUrl: 'https://docs.wokwi.com/parts/wokwi-rgb-led',
    scaffold: { globals: 'const int redPin = 9;\nconst int greenPin = 10;\nconst int bluePin = 11;', setup: ['pinMode(redPin, OUTPUT);', 'pinMode(greenPin, OUTPUT);', 'pinMode(bluePin, OUTPUT);'] },
  },
]
