import assert from 'node:assert/strict'
import { circuitHardwareDiagnostics, codeDiagnostics } from '../src/diagnostics.ts'

assert.deepEqual(codeDiagnostics(`
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(2, INPUT_PULLUP);
  Serial.begin(9600);
}
void loop() {
  digitalWrite(LED_BUILTIN, digitalRead(2));
  Serial.println("ready");
}
`), [])

assert.match(codeDiagnostics('void setup() {} void loop() { digitalWrite(LED_BUILTIN, HIGH); }').join('\n'), /LED_BUILTIN.*OUTPUT/)
assert.match(codeDiagnostics('void setup() {} void loop() { Serial.println("hello"); }').join('\n'), /Serial\.begin/)
assert.match(codeDiagnostics('void setup() {} void loop() { digitalRead(2); }').join('\n'), /INPUT_PULLUP/)
assert.match(codeDiagnostics('void setup() { pinMode(2, INPUT); } void loop() { digitalRead(2); }').join('\n'), /external pull-up or pull-down/)
assert.match(codeDiagnostics('void setup() {} void loop() { analogWrite(4, 128); }').join('\n'), /D4 is not a PWM pin/)
assert.match(codeDiagnostics('#include <Wire.h>\nvoid setup() { Wire.begin(); } void loop() {}').join('\n'), /SIMULATION LIMITATION: I2C\/Wire/)
assert.match(codeDiagnostics('#include <SD.h>\nvoid setup() { SD.begin(10); } void loop() {}').join('\n'), /SIMULATION LIMITATION: SD cards/)
assert.match(circuitHardwareDiagnostics(['led', 'servo']).join('\n'), /220-330 ohm series resistor/)
assert.match(circuitHardwareDiagnostics(['led', 'servo']).join('\n'), /external 5V supply/)

console.log('Code diagnostics tests passed.')
