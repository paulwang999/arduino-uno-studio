#include "StudioSonar.h"

Sonar sonar;

long Sonar::ping(uint8_t triggerPin, uint8_t echoPin, PingUnit unit, unsigned long timeout) const {
  pinMode(triggerPin, OUTPUT);
  digitalWrite(triggerPin, LOW);
  delayMicroseconds(2);
  digitalWrite(triggerPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(triggerPin, LOW);

  pinMode(echoPin, INPUT);
  const unsigned long echoTime = pulseIn(echoPin, HIGH, timeout);
  if (echoTime == 0) return 0;

  if (unit == PingUnit::MICROSECONDS) return static_cast<long>(echoTime);
  if (unit == PingUnit::INCHES) return static_cast<long>(echoTime / 148UL);
  return static_cast<long>(echoTime / 58UL);
}

