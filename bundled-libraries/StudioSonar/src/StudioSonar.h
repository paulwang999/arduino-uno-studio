#pragma once

#include <Arduino.h>

enum class PingUnit : uint8_t {
  MICROSECONDS,
  CENTIMETERS,
  INCHES,
};

class Sonar {
 public:
  long ping(
    uint8_t triggerPin,
    uint8_t echoPin,
    PingUnit unit = PingUnit::CENTIMETERS,
    unsigned long timeout = 30000UL
  ) const;
};

extern Sonar sonar;

