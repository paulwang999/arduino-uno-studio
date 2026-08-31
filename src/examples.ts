import type { ArduinoExample } from './exampleTypes'
import { generatedExamples, officialExamplesCommit } from './generatedExamples'

const studioExamples: ArduinoExample[] = [
  {
    id: 'studio:blink', name: 'Blink', fileName: 'blink.ino', category: 'Studio Lab', collection: 'Studio Lab', compatibility: 'uno',
    code: `void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
`,
  },
  {
    id: 'studio:button', name: 'Button', fileName: 'button.ino', category: 'Studio Lab', collection: 'Studio Lab', compatibility: 'uno',
    code: `const int buttonPin = 2;

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(buttonPin, INPUT_PULLUP);
}

void loop() {
  bool pressed = digitalRead(buttonPin) == LOW;
  digitalWrite(LED_BUILTIN, pressed ? HIGH : LOW);
}
`,
  },
  {
    id: 'studio:potentiometer', name: 'Potentiometer', fileName: 'potentiometer.ino', category: 'Studio Lab', collection: 'Studio Lab', compatibility: 'uno',
    code: `void setup() {
  Serial.begin(9600);
}

void loop() {
  int sensorValue = analogRead(A0);
  Serial.println(sensorValue);
  delay(100);
}
`,
  },
  {
    id: 'studio:photoresistor', name: 'Photoresistor', fileName: 'photoresistor.ino', category: 'Studio Lab', collection: 'Studio Lab', compatibility: 'uno',
    code: `void setup() {
  Serial.begin(9600);
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  int lightLevel = analogRead(A1);
  digitalWrite(LED_BUILTIN, lightLevel > 600 ? HIGH : LOW);
  Serial.println(lightLevel);
  delay(100);
}
`,
  },
  {
    id: 'studio:buzzer', name: 'Buzzer', fileName: 'buzzer.ino', category: 'Studio Lab', collection: 'Studio Lab', compatibility: 'uno',
    code: `void setup() {
}

void loop() {
  tone(8, 440, 500);
  delay(750);
  tone(8, 660, 500);
  delay(750);
}
`,
  },
  {
    id: 'studio:servo', name: 'Servo', fileName: 'servo.ino', category: 'Studio Lab', collection: 'Studio Lab', compatibility: 'uno',
    code: `#include <Servo.h>

Servo myServo;

void setup() {
  myServo.attach(9);
}

void loop() {
  myServo.write(20);
  delay(700);
  myServo.write(160);
  delay(700);
}
`,
  },
  {
    id: 'studio:ultrasonic', name: 'HC-SR04 Ultrasonic Distance (Ultrasound)', fileName: 'ultrasonic-distance.ino', category: 'Studio Lab', collection: 'Studio Lab', compatibility: 'uno',
    code: `#include <StudioSonar.h>

const int trigPin = 7;
const int echoPin = 6;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int distance = sonar.ping(trigPin, echoPin);
  Serial.print("Distance: ");
  Serial.print(distance);
  Serial.println(" cm");
  delay(500);
}
`,
  },
]

export const examples: ArduinoExample[] = [...studioExamples, ...generatedExamples]
export const defaultExample = studioExamples[0]
export const exampleCategories = Array.from(new Set(examples.map((example) => example.category)))
export const examplesSourceCommit = officialExamplesCommit

export function findExample(id: string) {
  return examples.find((example) => example.id === id)
}
