import type { Monaco } from '@monaco-editor/react'
import type { IDisposable } from 'monaco-editor'
import { generatedArduinoHeaders, generatedArduinoKeywords } from './generatedArduinoKeywords.ts'

type CompletionKind = 'class' | 'constant' | 'field' | 'function' | 'keyword' | 'method' | 'module' | 'snippet' | 'variable'

export type ArduinoCompletion = {
  label: string
  insertText: string
  detail: string
  documentation?: string
  kind: CompletionKind
  owner?: string
  snippet?: boolean
  sortText?: string
}

type FunctionDefinition = [label: string, insertText: string, signature: string, description: string]

const functionDefinitions: FunctionDefinition[] = [
  ['pinMode', 'pinMode(${1:pin}, ${2:OUTPUT})', 'void pinMode(uint8_t pin, uint8_t mode)', 'Configure an Arduino pin as INPUT, INPUT_PULLUP, or OUTPUT.'],
  ['digitalWrite', 'digitalWrite(${1:pin}, ${2:HIGH})', 'void digitalWrite(uint8_t pin, uint8_t value)', 'Write HIGH or LOW to a digital pin.'],
  ['digitalRead', 'digitalRead(${1:pin})', 'int digitalRead(uint8_t pin)', 'Read HIGH or LOW from a digital pin.'],
  ['analogRead', 'analogRead(${1:A0})', 'int analogRead(uint8_t pin)', 'Read a 10-bit value from an Uno analog input.'],
  ['analogReference', 'analogReference(${1:DEFAULT})', 'void analogReference(uint8_t mode)', 'Select the analog reference voltage.'],
  ['analogWrite', 'analogWrite(${1:9}, ${2:128})', 'void analogWrite(uint8_t pin, int value)', 'Write an 8-bit PWM value on a supported Uno pin.'],
  ['tone', 'tone(${1:8}, ${2:440}, ${3:250})', 'void tone(uint8_t pin, unsigned int frequency, unsigned long duration)', 'Generate a square-wave tone.'],
  ['noTone', 'noTone(${1:8})', 'void noTone(uint8_t pin)', 'Stop a tone on a pin.'],
  ['pulseIn', 'pulseIn(${1:pin}, ${2:HIGH}, ${3:1000000})', 'unsigned long pulseIn(uint8_t pin, uint8_t state, unsigned long timeout)', 'Measure the duration of a pulse.'],
  ['pulseInLong', 'pulseInLong(${1:pin}, ${2:HIGH}, ${3:1000000})', 'unsigned long pulseInLong(uint8_t pin, uint8_t state, unsigned long timeout)', 'Measure a pulse while allowing interrupts.'],
  ['shiftIn', 'shiftIn(${1:dataPin}, ${2:clockPin}, ${3:MSBFIRST})', 'uint8_t shiftIn(uint8_t dataPin, uint8_t clockPin, uint8_t bitOrder)', 'Shift one byte in from two digital pins.'],
  ['shiftOut', 'shiftOut(${1:dataPin}, ${2:clockPin}, ${3:MSBFIRST}, ${4:value})', 'void shiftOut(uint8_t dataPin, uint8_t clockPin, uint8_t bitOrder, uint8_t value)', 'Shift one byte out through two digital pins.'],
  ['millis', 'millis()', 'unsigned long millis()', 'Return milliseconds since the sketch started.'],
  ['micros', 'micros()', 'unsigned long micros()', 'Return microseconds since the sketch started.'],
  ['delay', 'delay(${1:1000})', 'void delay(unsigned long milliseconds)', 'Pause the sketch for a number of milliseconds.'],
  ['delayMicroseconds', 'delayMicroseconds(${1:10})', 'void delayMicroseconds(unsigned int microseconds)', 'Pause for a number of microseconds.'],
  ['min', 'min(${1:a}, ${2:b})', 'min(a, b)', 'Return the smaller value.'],
  ['max', 'max(${1:a}, ${2:b})', 'max(a, b)', 'Return the larger value.'],
  ['abs', 'abs(${1:value})', 'abs(value)', 'Return the absolute value.'],
  ['constrain', 'constrain(${1:value}, ${2:minimum}, ${3:maximum})', 'constrain(value, minimum, maximum)', 'Keep a value within a range.'],
  ['map', 'map(${1:value}, ${2:fromLow}, ${3:fromHigh}, ${4:toLow}, ${5:toHigh})', 'long map(long value, long fromLow, long fromHigh, long toLow, long toHigh)', 'Map a number from one range to another.'],
  ['pow', 'pow(${1:base}, ${2:exponent})', 'double pow(double base, double exponent)', 'Raise a number to a power.'],
  ['sq', 'sq(${1:value})', 'sq(value)', 'Return the square of a value.'],
  ['sqrt', 'sqrt(${1:value})', 'double sqrt(double value)', 'Return the square root.'],
  ['sin', 'sin(${1:radians})', 'double sin(double radians)', 'Return the sine of an angle in radians.'],
  ['cos', 'cos(${1:radians})', 'double cos(double radians)', 'Return the cosine of an angle in radians.'],
  ['tan', 'tan(${1:radians})', 'double tan(double radians)', 'Return the tangent of an angle in radians.'],
  ['random', 'random(${1:maximum})', 'long random(long maximum)', 'Return a pseudo-random number.'],
  ['randomSeed', 'randomSeed(${1:seed})', 'void randomSeed(unsigned long seed)', 'Initialize the pseudo-random number generator.'],
  ['lowByte', 'lowByte(${1:value})', 'uint8_t lowByte(value)', 'Return the low byte of a value.'],
  ['highByte', 'highByte(${1:value})', 'uint8_t highByte(value)', 'Return the high byte of a value.'],
  ['bitRead', 'bitRead(${1:value}, ${2:bit})', 'bitRead(value, bit)', 'Read one bit from a value.'],
  ['bitWrite', 'bitWrite(${1:value}, ${2:bit}, ${3:bitValue})', 'bitWrite(value, bit, bitValue)', 'Write one bit in a value.'],
  ['bitSet', 'bitSet(${1:value}, ${2:bit})', 'bitSet(value, bit)', 'Set one bit to 1.'],
  ['bitClear', 'bitClear(${1:value}, ${2:bit})', 'bitClear(value, bit)', 'Clear one bit to 0.'],
  ['bit', 'bit(${1:bit})', 'bit(bit)', 'Return a value with one bit set.'],
  ['attachInterrupt', 'attachInterrupt(digitalPinToInterrupt(${1:pin}), ${2:handler}, ${3:CHANGE})', 'void attachInterrupt(uint8_t interrupt, void (*handler)(), int mode)', 'Run a function when an external interrupt occurs.'],
  ['detachInterrupt', 'detachInterrupt(digitalPinToInterrupt(${1:pin}))', 'void detachInterrupt(uint8_t interrupt)', 'Disable an external interrupt.'],
  ['digitalPinToInterrupt', 'digitalPinToInterrupt(${1:pin})', 'int digitalPinToInterrupt(uint8_t pin)', 'Convert a digital pin number to its interrupt number.'],
  ['interrupts', 'interrupts()', 'void interrupts()', 'Enable interrupts.'],
  ['noInterrupts', 'noInterrupts()', 'void noInterrupts()', 'Disable interrupts temporarily.'],
  ['isAlpha', 'isAlpha(${1:character})', 'bool isAlpha(char character)', 'Test whether a character is a letter.'],
  ['isAlphaNumeric', 'isAlphaNumeric(${1:character})', 'bool isAlphaNumeric(char character)', 'Test whether a character is a letter or number.'],
  ['isAscii', 'isAscii(${1:character})', 'bool isAscii(char character)', 'Test whether a character is ASCII.'],
  ['isControl', 'isControl(${1:character})', 'bool isControl(char character)', 'Test whether a character is a control character.'],
  ['isDigit', 'isDigit(${1:character})', 'bool isDigit(char character)', 'Test whether a character is a digit.'],
  ['isGraph', 'isGraph(${1:character})', 'bool isGraph(char character)', 'Test whether a character is printable and not a space.'],
  ['isHexadecimalDigit', 'isHexadecimalDigit(${1:character})', 'bool isHexadecimalDigit(char character)', 'Test whether a character is hexadecimal.'],
  ['isLowerCase', 'isLowerCase(${1:character})', 'bool isLowerCase(char character)', 'Test whether a character is lowercase.'],
  ['isPrintable', 'isPrintable(${1:character})', 'bool isPrintable(char character)', 'Test whether a character is printable.'],
  ['isPunct', 'isPunct(${1:character})', 'bool isPunct(char character)', 'Test whether a character is punctuation.'],
  ['isSpace', 'isSpace(${1:character})', 'bool isSpace(char character)', 'Test whether a character is a space.'],
  ['isUpperCase', 'isUpperCase(${1:character})', 'bool isUpperCase(char character)', 'Test whether a character is uppercase.'],
  ['isWhitespace', 'isWhitespace(${1:character})', 'bool isWhitespace(char character)', 'Test whether a character is whitespace.'],
  ['word', 'word(${1:highByte}, ${2:lowByte})', 'word(highByte, lowByte)', 'Create a 16-bit word from two bytes.'],
]

const coreFunctions: ArduinoCompletion[] = functionDefinitions.map(([label, insertText, detail, documentation]) => ({
  label, insertText, detail, documentation, kind: 'function', snippet: true, sortText: `10-${label}`,
}))

const structureCompletions: ArduinoCompletion[] = [
  { label: 'setup', insertText: 'void setup() {\n  ${1:// Runs once}\n}', detail: 'Arduino sketch setup function', documentation: 'Runs once when the Uno starts or resets.', kind: 'snippet', snippet: true },
  { label: 'loop', insertText: 'void loop() {\n  ${1:// Repeats forever}\n}', detail: 'Arduino sketch loop function', documentation: 'Runs repeatedly after setup finishes.', kind: 'snippet', snippet: true },
  { label: 'if', insertText: 'if (${1:condition}) {\n  ${2}\n}', detail: 'if statement', kind: 'snippet', snippet: true },
  { label: 'if else', insertText: 'if (${1:condition}) {\n  ${2}\n} else {\n  ${3}\n}', detail: 'if / else statement', kind: 'snippet', snippet: true },
  { label: 'for', insertText: 'for (int ${1:index} = 0; ${1:index} < ${2:count}; ${1:index}++) {\n  ${3}\n}', detail: 'for loop', kind: 'snippet', snippet: true },
  { label: 'while', insertText: 'while (${1:condition}) {\n  ${2}\n}', detail: 'while loop', kind: 'snippet', snippet: true },
  { label: 'do while', insertText: 'do {\n  ${1}\n} while (${2:condition});', detail: 'do / while loop', kind: 'snippet', snippet: true },
  { label: 'switch', insertText: 'switch (${1:value}) {\n  case ${2:0}:\n    ${3}\n    break;\n  default:\n    ${4}\n}', detail: 'switch statement', kind: 'snippet', snippet: true },
  { label: '#include', insertText: '#include <${1:library.h}>', detail: 'Include an Arduino library', kind: 'snippet', snippet: true, sortText: '00-include' },
  { label: '#define', insertText: '#define ${1:NAME} ${2:value}', detail: 'Define a preprocessor macro', kind: 'snippet', snippet: true, sortText: '00-define' },
]

const typeNames = [
  'void', 'bool', 'boolean', 'char', 'byte', 'short', 'int', 'word', 'long', 'float', 'double', 'String', 'size_t',
  'int8_t', 'uint8_t', 'int16_t', 'uint16_t', 'int32_t', 'uint32_t', 'int64_t', 'uint64_t',
  'Servo', 'Stepper', 'LiquidCrystal', 'SoftwareSerial', 'File', 'CRGB', 'CHSV', 'CRGBPalette16', 'CHSVPalette16', 'Sonar', 'PingUnit',
]

const keywordNames = [
  'alignas', 'alignof', 'asm', 'auto', 'break', 'case', 'catch', 'class', 'const', 'constexpr', 'continue', 'default',
  'delete', 'do', 'else', 'enum', 'explicit', 'export', 'extern', 'for', 'friend', 'goto', 'if', 'inline', 'mutable',
  'namespace', 'new', 'noexcept', 'operator', 'private', 'protected', 'public', 'register', 'return', 'signed', 'sizeof',
  'static', 'struct', 'switch', 'template', 'this', 'throw', 'try', 'typedef', 'typeid', 'typename', 'union', 'unsigned',
  'using', 'virtual', 'volatile', 'while',
]

const constantNames = [
  'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'LED_BUILTIN', 'true', 'false', 'NULL', 'PI', 'HALF_PI', 'TWO_PI',
  'DEG_TO_RAD', 'RAD_TO_DEG', 'LSBFIRST', 'MSBFIRST', 'CHANGE', 'FALLING', 'RISING', 'DEFAULT', 'INTERNAL', 'EXTERNAL',
  'DEC', 'HEX', 'OCT', 'BIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'SDA', 'SCL', 'SS', 'MOSI', 'MISO', 'SCK',
  'FILE_READ', 'FILE_WRITE', 'PROGMEM',
]

const registerNames = [
  'PINB', 'PINC', 'PIND', 'PORTB', 'PORTC', 'PORTD', 'DDRB', 'DDRC', 'DDRD', 'SREG', 'SP', 'SPL', 'SPH',
  'PCICR', 'PCIFR', 'PCMSK0', 'PCMSK1', 'PCMSK2', 'EICRA', 'EIMSK', 'EIFR',
  'TCCR0A', 'TCCR0B', 'TCNT0', 'OCR0A', 'OCR0B', 'TIMSK0', 'TIFR0',
  'TCCR1A', 'TCCR1B', 'TCCR1C', 'TCNT1', 'OCR1A', 'OCR1B', 'ICR1', 'TIMSK1', 'TIFR1',
  'TCCR2A', 'TCCR2B', 'TCNT2', 'OCR2A', 'OCR2B', 'TIMSK2', 'TIFR2', 'ASSR',
  'ADMUX', 'ADCSRA', 'ADCSRB', 'ADCL', 'ADCH', 'ADC', 'DIDR0', 'ACSR',
  'UBRR0H', 'UBRR0L', 'UCSR0A', 'UCSR0B', 'UCSR0C', 'UDR0', 'SPCR', 'SPSR', 'SPDR',
  'TWBR', 'TWSR', 'TWAR', 'TWDR', 'TWCR', 'TWAMR', 'EEAR', 'EEDR', 'EECR', 'WDTCSR', 'CLKPR', 'PRR', 'MCUSR',
]

const languageCompletions: ArduinoCompletion[] = [
  ...typeNames.map((label) => ({ label, insertText: label, detail: 'Arduino / C++ data type', kind: 'class' as const, sortText: `20-${label}` })),
  ...keywordNames.map((label) => ({ label, insertText: label, detail: 'C++ keyword', kind: 'keyword' as const, sortText: `30-${label}` })),
  ...constantNames.map((label) => ({ label, insertText: label, detail: 'Arduino Uno constant', kind: 'constant' as const, sortText: `20-${label}` })),
  ...registerNames.map((label) => ({ label, insertText: label, detail: 'ATmega328P register', kind: 'field' as const, sortText: `40-${label}` })),
]

const member = (owner: string, definitions: Array<[string, string, string, string?]>): ArduinoCompletion[] => definitions.map(([label, insertText, detail, documentation]) => ({
  label, insertText, detail, documentation, owner, kind: 'method', snippet: insertText.includes('${'), sortText: `05-${label}`,
}))

const streamMembers: Array<[string, string, string, string?]> = [
  ['available', 'available()', 'int available()', 'Return the number of bytes ready to read.'],
  ['read', 'read()', 'int read()', 'Read the next byte.'],
  ['peek', 'peek()', 'int peek()', 'Read the next byte without removing it.'],
  ['flush', 'flush()', 'void flush()', 'Wait for outgoing data to finish.'],
  ['write', 'write(${1:value})', 'size_t write(value)', 'Write binary data.'],
  ['print', 'print(${1:value})', 'size_t print(value)', 'Print a value as readable text.'],
  ['println', 'println(${1:value})', 'size_t println(value)', 'Print a value followed by a new line.'],
  ['readBytes', 'readBytes(${1:buffer}, ${2:length})', 'size_t readBytes(char *buffer, size_t length)'],
  ['readBytesUntil', "readBytesUntil('${1:\\n}', ${2:buffer}, ${3:length})", 'size_t readBytesUntil(char terminator, char *buffer, size_t length)'],
  ['readString', 'readString()', 'String readString()'],
  ['readStringUntil', "readStringUntil('${1:\\n}')", 'String readStringUntil(char terminator)'],
  ['parseInt', 'parseInt()', 'long parseInt()'],
  ['parseFloat', 'parseFloat()', 'float parseFloat()'],
  ['setTimeout', 'setTimeout(${1:1000})', 'void setTimeout(unsigned long timeout)'],
  ['find', 'find(${1:target})', 'bool find(char *target)'],
]

const objectMembers: ArduinoCompletion[] = [
  ...member('sonar', [
    ['ping', 'ping(${1:trigPin}, ${2:echoPin})', 'long sonar.ping(uint8_t trigPin, uint8_t echoPin)', 'Measure HC-SR04 distance in centimetres. The first pin is Trigger and the second is Echo.'],
  ]),
  ...member('Serial', [
    ['begin', 'begin(${1:9600})', 'void Serial.begin(unsigned long baud)', 'Start USB serial communication.'],
    ['end', 'end()', 'void Serial.end()', 'Stop serial communication.'],
    ['availableForWrite', 'availableForWrite()', 'int Serial.availableForWrite()'],
    ...streamMembers,
  ]),
  ...member('SoftwareSerial', [
    ['begin', 'begin(${1:9600})', 'void SoftwareSerial.begin(long baud)'],
    ['end', 'end()', 'void SoftwareSerial.end()'],
    ['listen', 'listen()', 'bool SoftwareSerial.listen()'],
    ['isListening', 'isListening()', 'bool SoftwareSerial.isListening()'],
    ...streamMembers,
  ]),
  ...member('Wire', [
    ['begin', 'begin()', 'void Wire.begin()'],
    ['end', 'end()', 'void Wire.end()'],
    ['setClock', 'setClock(${1:100000})', 'void Wire.setClock(uint32_t frequency)'],
    ['beginTransmission', 'beginTransmission(${1:address})', 'void Wire.beginTransmission(uint8_t address)'],
    ['endTransmission', 'endTransmission()', 'uint8_t Wire.endTransmission()'],
    ['requestFrom', 'requestFrom(${1:address}, ${2:count})', 'uint8_t Wire.requestFrom(uint8_t address, uint8_t count)'],
    ['onReceive', 'onReceive(${1:handler})', 'void Wire.onReceive(void (*handler)(int))'],
    ['onRequest', 'onRequest(${1:handler})', 'void Wire.onRequest(void (*handler)())'],
    ...streamMembers.filter(([label]) => ['available', 'read', 'peek', 'flush', 'write'].includes(label)),
  ]),
  ...member('SPI', [
    ['begin', 'begin()', 'void SPI.begin()'],
    ['end', 'end()', 'void SPI.end()'],
    ['beginTransaction', 'beginTransaction(SPISettings(${1:4000000}, ${2:MSBFIRST}, ${3:SPI_MODE0}))', 'void SPI.beginTransaction(SPISettings settings)'],
    ['endTransaction', 'endTransaction()', 'void SPI.endTransaction()'],
    ['transfer', 'transfer(${1:value})', 'uint8_t SPI.transfer(uint8_t value)'],
    ['transfer16', 'transfer16(${1:value})', 'uint16_t SPI.transfer16(uint16_t value)'],
    ['setBitOrder', 'setBitOrder(${1:MSBFIRST})', 'void SPI.setBitOrder(uint8_t order)'],
    ['setDataMode', 'setDataMode(${1:SPI_MODE0})', 'void SPI.setDataMode(uint8_t mode)'],
    ['setClockDivider', 'setClockDivider(${1:SPI_CLOCK_DIV4})', 'void SPI.setClockDivider(uint8_t divider)'],
  ]),
  ...member('EEPROM', [
    ['read', 'read(${1:address})', 'uint8_t EEPROM.read(int address)'],
    ['write', 'write(${1:address}, ${2:value})', 'void EEPROM.write(int address, uint8_t value)'],
    ['update', 'update(${1:address}, ${2:value})', 'void EEPROM.update(int address, uint8_t value)'],
    ['get', 'get(${1:address}, ${2:value})', 'EEPROM.get(address, value)'],
    ['put', 'put(${1:address}, ${2:value})', 'EEPROM.put(address, value)'],
    ['length', 'length()', 'uint16_t EEPROM.length()'],
  ]),
  ...member('SD', [
    ['begin', 'begin(${1:10})', 'bool SD.begin(uint8_t chipSelect)'],
    ['open', 'open(${1:"data.txt"}, ${2:FILE_READ})', 'File SD.open(const char *path, uint8_t mode)'],
    ['exists', 'exists(${1:"data.txt"})', 'bool SD.exists(const char *path)'],
    ['mkdir', 'mkdir(${1:"folder"})', 'bool SD.mkdir(const char *path)'],
    ['remove', 'remove(${1:"data.txt"})', 'bool SD.remove(const char *path)'],
    ['rmdir', 'rmdir(${1:"folder"})', 'bool SD.rmdir(const char *path)'],
  ]),
  ...member('File', [
    ['name', 'name()', 'const char *File.name()'],
    ['size', 'size()', 'uint32_t File.size()'],
    ['position', 'position()', 'uint32_t File.position()'],
    ['seek', 'seek(${1:position})', 'bool File.seek(uint32_t position)'],
    ['close', 'close()', 'void File.close()'],
    ['isDirectory', 'isDirectory()', 'bool File.isDirectory()'],
    ['openNextFile', 'openNextFile()', 'File File.openNextFile()'],
    ['rewindDirectory', 'rewindDirectory()', 'void File.rewindDirectory()'],
    ...streamMembers,
  ]),
  ...member('Servo', [
    ['attach', 'attach(${1:9})', 'uint8_t Servo.attach(int pin)'],
    ['detach', 'detach()', 'void Servo.detach()'],
    ['write', 'write(${1:90})', 'void Servo.write(int angle)'],
    ['writeMicroseconds', 'writeMicroseconds(${1:1500})', 'void Servo.writeMicroseconds(int microseconds)'],
    ['read', 'read()', 'int Servo.read()'],
    ['attached', 'attached()', 'bool Servo.attached()'],
  ]),
  ...member('Stepper', [
    ['setSpeed', 'setSpeed(${1:60})', 'void Stepper.setSpeed(long rpm)'],
    ['step', 'step(${1:steps})', 'void Stepper.step(int steps)'],
  ]),
  ...member('LiquidCrystal', [
    ['begin', 'begin(${1:16}, ${2:2})', 'void LiquidCrystal.begin(uint8_t columns, uint8_t rows)'],
    ['clear', 'clear()', 'void LiquidCrystal.clear()'],
    ['home', 'home()', 'void LiquidCrystal.home()'],
    ['setCursor', 'setCursor(${1:0}, ${2:0})', 'void LiquidCrystal.setCursor(uint8_t column, uint8_t row)'],
    ['cursor', 'cursor()', 'void LiquidCrystal.cursor()'],
    ['noCursor', 'noCursor()', 'void LiquidCrystal.noCursor()'],
    ['blink', 'blink()', 'void LiquidCrystal.blink()'],
    ['noBlink', 'noBlink()', 'void LiquidCrystal.noBlink()'],
    ['display', 'display()', 'void LiquidCrystal.display()'],
    ['noDisplay', 'noDisplay()', 'void LiquidCrystal.noDisplay()'],
    ['scrollDisplayLeft', 'scrollDisplayLeft()', 'void LiquidCrystal.scrollDisplayLeft()'],
    ['scrollDisplayRight', 'scrollDisplayRight()', 'void LiquidCrystal.scrollDisplayRight()'],
    ['createChar', 'createChar(${1:index}, ${2:pixels})', 'void LiquidCrystal.createChar(uint8_t index, uint8_t pixels[])'],
    ...streamMembers.filter(([label]) => ['write', 'print', 'println'].includes(label)),
  ]),
  ...member('FastLED', [
    ['addLeds', 'addLeds<WS2812B, ${1:6}, GRB>(${2:leds}, ${3:LED_COUNT})', 'FastLED.addLeds<CHIPSET, DATA_PIN, COLOR_ORDER>(leds, count)'],
    ['show', 'show()', 'void FastLED.show()'],
    ['clear', 'clear()', 'void FastLED.clear()'],
    ['clearData', 'clearData()', 'void FastLED.clearData()'],
    ['setBrightness', 'setBrightness(${1:80})', 'void FastLED.setBrightness(uint8_t brightness)'],
    ['getBrightness', 'getBrightness()', 'uint8_t FastLED.getBrightness()'],
    ['showColor', 'showColor(${1:CRGB::Blue})', 'void FastLED.showColor(CRGB color)'],
    ['setMaxPowerInVoltsAndMilliamps', 'setMaxPowerInVoltsAndMilliamps(${1:5}, ${2:500})', 'void FastLED.setMaxPowerInVoltsAndMilliamps(uint8_t volts, uint32_t milliamps)'],
    ['delay', 'delay(${1:30})', 'void FastLED.delay(unsigned long milliseconds)'],
  ]),
  ...member('CRGB', [
    ['setRGB', 'setRGB(${1:red}, ${2:green}, ${3:blue})', 'CRGB &CRGB.setRGB(uint8_t red, uint8_t green, uint8_t blue)'],
    ['setHSV', 'setHSV(${1:hue}, ${2:saturation}, ${3:value})', 'CRGB &CRGB.setHSV(uint8_t hue, uint8_t saturation, uint8_t value)'],
    ['fadeToBlackBy', 'fadeToBlackBy(${1:amount})', 'CRGB &CRGB.fadeToBlackBy(uint8_t amount)'],
    ['nscale8', 'nscale8(${1:scale})', 'CRGB &CRGB.nscale8(uint8_t scale)'],
  ]),
  ...member('String', [
    ['length', 'length()', 'unsigned int String.length()'],
    ['charAt', 'charAt(${1:index})', 'char String.charAt(unsigned int index)'],
    ['setCharAt', 'setCharAt(${1:index}, ${2:character})', 'void String.setCharAt(unsigned int index, char character)'],
    ['compareTo', 'compareTo(${1:other})', 'int String.compareTo(const String &other)'],
    ['equals', 'equals(${1:other})', 'bool String.equals(const String &other)'],
    ['equalsIgnoreCase', 'equalsIgnoreCase(${1:other})', 'bool String.equalsIgnoreCase(const String &other)'],
    ['startsWith', 'startsWith(${1:prefix})', 'bool String.startsWith(const String &prefix)'],
    ['endsWith', 'endsWith(${1:suffix})', 'bool String.endsWith(const String &suffix)'],
    ['indexOf', 'indexOf(${1:value})', 'int String.indexOf(value)'],
    ['lastIndexOf', 'lastIndexOf(${1:value})', 'int String.lastIndexOf(value)'],
    ['substring', 'substring(${1:start}, ${2:end})', 'String String.substring(unsigned int start, unsigned int end)'],
    ['replace', 'replace(${1:find}, ${2:replacement})', 'void String.replace(find, replacement)'],
    ['remove', 'remove(${1:index}, ${2:count})', 'void String.remove(unsigned int index, unsigned int count)'],
    ['toInt', 'toInt()', 'long String.toInt()'],
    ['toFloat', 'toFloat()', 'float String.toFloat()'],
    ['toLowerCase', 'toLowerCase()', 'void String.toLowerCase()'],
    ['toUpperCase', 'toUpperCase()', 'void String.toUpperCase()'],
    ['trim', 'trim()', 'void String.trim()'],
  ]),
]

const generatedCompletions: ArduinoCompletion[] = generatedArduinoKeywords.map(({ name, library, tokenType }) => {
  const parts = name.split('::')
  const label = parts.at(-1) || name
  const owner = parts.length > 1 ? parts.slice(0, -1).join('::') : undefined
  const constant = tokenType.includes('LITERAL') || owner === 'CRGB'
  const callable = tokenType.includes('KEYWORD2') && !constant
  return {
    label,
    insertText: callable ? `${label}(\${1})` : label,
    detail: `${library} ${constant ? 'constant' : callable ? 'function or method' : 'type'}`,
    documentation: `Provided by the bundled ${library} library.`,
    kind: constant ? 'constant' : callable ? 'function' : 'class',
    owner,
    snippet: callable,
    sortText: `50-${label}`,
  }
})

const serialShortcuts: ArduinoCompletion[] = streamMembers.map(([label, insertText, detail, documentation]) => ({
  label,
  insertText: `Serial.${insertText}`,
  detail: `${detail} via Serial`,
  documentation: documentation || 'Serial stream method.',
  kind: 'function',
  snippet: insertText.includes('${'),
  sortText: `15-${label}`,
}))

function unique(completions: ArduinoCompletion[]) {
  return [...new Map(completions.map((completion) => [`${completion.owner || ''}:${completion.label}`, completion])).values()]
}

const globalCompletions = unique([
  ...coreFunctions,
  ...structureCompletions,
  ...serialShortcuts,
  ...languageCompletions,
  ...generatedCompletions.filter((completion) => !completion.owner),
])

const memberCompletions = unique([
  ...objectMembers,
  ...generatedCompletions.filter((completion) => completion.owner),
])

const knownObjectOwners = new Set(['Serial', 'Wire', 'SPI', 'EEPROM', 'SD', 'FastLED', 'CRGB', 'sonar'])
const declarationTypes = ['bool', 'boolean', 'byte', 'char', 'double', 'float', 'int', 'long', 'short', 'signed', 'String', 'unsigned', 'word', 'size_t', 'int8_t', 'uint8_t', 'int16_t', 'uint16_t', 'int32_t', 'uint32_t', 'Servo', 'Stepper', 'LiquidCrystal', 'SoftwareSerial', 'File', 'CRGB', 'CHSV', 'Sonar', 'PingUnit']
const declarationTypePattern = declarationTypes.sort((left, right) => right.length - left.length).map((type) => type.replace(' ', '\\s+')).join('|')

function sourceWithoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\r\n]*/g, ' ')
}

export function extractArduinoSymbols(source: string) {
  const clean = sourceWithoutComments(source)
  const completions: ArduinoCompletion[] = []
  const objectTypes = new Map<string, string>()
  const add = (label: string, kind: CompletionKind, detail: string) => {
    if (label && !keywordNames.includes(label)) completions.push({ label, insertText: label, detail, kind, sortText: `01-${label}` })
  }

  for (const match of source.matchAll(/^\s*#define\s+([A-Za-z_]\w*)/gm)) add(match[1], 'constant', 'Macro from this sketch')
  for (const match of clean.matchAll(new RegExp(`\\b(${declarationTypePattern})\\s*(?:[*&]\\s*)?([A-Za-z_]\\w*)\\s*(?=[=;,)\\[])`, 'g'))) {
    const type = match[1].replace(/\s+/g, ' ')
    const name = match[2]
    add(name, 'variable', `${type} from this sketch`)
    if (['Servo', 'Stepper', 'LiquidCrystal', 'SoftwareSerial', 'File', 'CRGB', 'String', 'Sonar'].includes(type)) objectTypes.set(name, type)
  }
  for (const match of clean.matchAll(/\b(Servo|Stepper|LiquidCrystal|SoftwareSerial|File|CRGB|String|Sonar)\s+([A-Za-z_]\w*)\s*(?=\(|;|=|\[)/g)) {
    add(match[2], 'variable', `${match[1]} from this sketch`)
    objectTypes.set(match[2], match[1])
  }
  for (const match of clean.matchAll(/\b(?:void|bool|boolean|byte|char|double|float|int|long|short|String|unsigned\s+\w+|\w+_t)\s+([A-Za-z_]\w*)\s*\(([^;{}]*)\)\s*(?:\{|;)/g)) {
    add(match[1], 'function', `Function from this sketch: ${match[1]}(${match[2].trim()})`)
    for (const parameter of match[2].split(',')) {
      const parameterName = /([A-Za-z_]\w*)\s*(?:\[\s*\])?\s*$/.exec(parameter.trim())?.[1]
      if (parameterName) add(parameterName, 'variable', 'Function parameter from this sketch')
    }
  }
  for (const match of clean.matchAll(/\benum(?:\s+class)?(?:\s+[A-Za-z_]\w*)?\s*\{([^}]*)\}/g)) {
    for (const entry of match[1].split(',')) {
      const name = /^\s*([A-Za-z_]\w*)/.exec(entry)?.[1]
      if (name) add(name, 'constant', 'Enum value from this sketch')
    }
  }
  return { completions: unique(completions), objectTypes }
}

function completionContext(source: string, linePrefix: string, lineSuffix = '') {
  const include = /#include\s*([<"])([^>"]*)$/.exec(linePrefix)
  if (include) {
    const close = include[1] === '<' ? '>' : '"'
    const insertClose = lineSuffix.trimStart().startsWith(close) ? '' : close
    return {
      replacementLength: include[2].length,
      completions: generatedArduinoHeaders.map<ArduinoCompletion>((header) => ({
        label: header,
        insertText: `${header}${insertClose}`,
        detail: 'Bundled Arduino header',
        kind: 'module' as const,
        snippet: false,
        sortText: `00-${header}`,
      })),
    }
  }

  const symbols = extractArduinoSymbols(source)
  const memberAccess = /([A-Za-z_]\w*)\s*(?:\.|::)\s*[A-Za-z_]*$/.exec(linePrefix)
  if (memberAccess) {
    const identifier = memberAccess[1]
    const owner = symbols.objectTypes.get(identifier) || (knownObjectOwners.has(identifier) ? identifier : identifier)
    return {
      replacementLength: /[A-Za-z_]*$/.exec(linePrefix)?.[0].length || 0,
      completions: memberCompletions.filter((completion) => completion.owner === owner),
    }
  }
  const preprocessor = /#[A-Za-z_]*$/.exec(linePrefix)
  return { replacementLength: preprocessor?.[0].length || /[A-Za-z_]*$/.exec(linePrefix)?.[0].length || 0, completions: unique([...symbols.completions, ...globalCompletions]) }
}

export function getArduinoCompletionCandidates(source: string, linePrefix: string, lineSuffix = '') {
  return completionContext(source, linePrefix, lineSuffix).completions
}

function completionKind(monaco: Monaco, kind: CompletionKind) {
  const kinds = monaco.languages.CompletionItemKind
  return {
    class: kinds.Class,
    constant: kinds.Constant,
    field: kinds.Field,
    function: kinds.Function,
    keyword: kinds.Keyword,
    method: kinds.Method,
    module: kinds.Module,
    snippet: kinds.Snippet,
    variable: kinds.Variable,
  }[kind]
}

export function registerArduinoAutocomplete(monaco: Monaco): IDisposable {
  return monaco.languages.registerCompletionItemProvider('cpp', {
    triggerCharacters: ['.', ':', '<', '"', '#'],
    provideCompletionItems(model, position) {
      const line = model.getLineContent(position.lineNumber)
      const linePrefix = line.slice(0, position.column - 1)
      const lineSuffix = line.slice(position.column - 1)
      const blockCommentOpen = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column }).lastIndexOf('/*')
      const blockCommentClose = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column }).lastIndexOf('*/')
      if (linePrefix.trimStart().startsWith('//') || blockCommentOpen > blockCommentClose) return { suggestions: [] }
      const context = completionContext(model.getValue(), linePrefix, lineSuffix)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: Math.max(1, position.column - context.replacementLength),
        endColumn: position.column,
      }
      return {
        suggestions: context.completions.map((completion) => ({
          label: completion.label,
          insertText: completion.insertText,
          detail: completion.detail,
          documentation: completion.documentation,
          kind: completionKind(monaco, completion.kind),
          insertTextRules: completion.snippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
          range,
          sortText: completion.sortText,
          filterText: completion.label,
        })),
      }
    },
  })
}

export const arduinoCompletionCount = globalCompletions.length + memberCompletions.length
