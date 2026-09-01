import assert from 'node:assert/strict'
import { fixArduinoCode } from '../src/codeFixer.ts'

const untidySketch = `void setup( {
pinMode(13, OUTPUT)
}

void loop() {
if (digitalRead(2) == HIGH {
digitalWrite(13, HIGH)
}
}`

const fixedSketch = fixArduinoCode(untidySketch)
assert.equal(fixedSketch.code, `void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  if (digitalRead(2) == HIGH) {
    digitalWrite(13, HIGH);
  }
}`)
assert.equal(fixedSketch.addedParentheses, 2)
assert.equal(fixedSketch.addedSemicolons, 2)

const customFunction = fixArduinoCode(`void loop() {
Wing_Flaps
}

void Wing_Flaps() {
int angle = 90
}`)
assert.match(customFunction.code, /void loop\(\) \{\n  Wing_Flaps\(\);\n\}/)
assert.match(customFunction.code, /void Wing_Flaps\(\) \{\n  int angle = 90;\n\}/)
assert.equal(customFunction.addedFunctionCalls, 1)

const commentsAndStrings = `void setup() {
Serial.println("Keep ; and ) inside this string") // Keep this comment { (
/* Keep this block comment:
  } );
*/
}`
const fixedComments = fixArduinoCode(commentsAndStrings)
assert.match(fixedComments.code, /Serial\.println\("Keep ; and \) inside this string"\); \/\/ Keep this comment \{ \(/)
assert.match(fixedComments.code, /\/\* Keep this block comment:\n  } \);\n  \*\//)

const multilineCall = `void loop() {
  digitalWrite(
    LED_BUILTIN,
    HIGH
  );
}`
assert.equal(fixArduinoCode(multilineCall).code, multilineCall)

const missingBrace = fixArduinoCode(`void setup() {
pinMode(13, OUTPUT)

void loop() {
digitalWrite(13, HIGH)
}`)
assert.equal(missingBrace.addedBraces, 1)
assert.equal((missingBrace.code.match(/}/g) || []).length, 2)

const switchSketch = fixArduinoCode(`void loop() {
switch (mode) {
case 1:
digitalWrite(13, HIGH)
break
default:
digitalWrite(13, LOW)
}
}`)
assert.equal(switchSketch.code, `void loop() {
  switch (mode) {
    case 1:
      digitalWrite(13, HIGH);
      break;
    default:
      digitalWrite(13, LOW);
  }
}`)

assert.equal(fixArduinoCode(fixedSketch.code).code, fixedSketch.code, 'Fix Code must be idempotent.')

console.log('Code fixer tests passed.')
