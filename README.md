# Arduino Uno Studio

Arduino Uno Studio is a Windows desktop learning environment for Arduino Uno. It combines an English code editor, a searchable MakeCode-style toolbox of draggable Arduino commands, the official Uno compiler target, a component circuit workspace, AVR simulation, USB upload, and Serial Monitor.

## Highlights

- Drag beginner-friendly Arduino C++ commands into the editor, then edit real code.
- Compile and upload sketches to a physical Arduino Uno with the bundled Arduino CLI toolchain.
- Run compiled ATmega328P programs in the AVR simulator.
- Build freely wired circuits with an Uno, breadboards, power sources, sensors, LEDs, servos, buzzers, WS2812B strips, and an HC-SR04 ultrasonic sensor.
- Use the bundled `StudioSonar` API to read HC-SR04 distance with one line:

```cpp
int distance = sonar.ping(trigPin, echoPin);
```

The application UI is currently English and the desktop build targets Windows x64.

## Development

```powershell
npm install
npm run runtime:setup
npm run dev
```

Build the Windows installer:

```powershell
npm run build
```

## Verification

```powershell
npm run lint
npm run diagnostics:test
npm run toolbox:test
npm run circuit:test
npm run electrical:test
npm run ws2812:test
npm run ultrasonic:test
npm run sonar-api:test
npm run runtime:test
npm run simulator:test
npm run hardware:test
npm run examples:test
```

Both simulation and hardware upload compile for `arduino:avr:uno`. The simulator executes that compiled ATmega328P program and models digital I/O, Uno ADC inputs, timers, PWM-based servo output, tone output, USART Serial, and WS2812B data generated through FastLED.

Circuit supports any number of LEDs, WS2812B strips, pushbuttons, resistors, potentiometers, light sensor modules, HC-SR04 ultrasonic sensors, passive buzzers, servos, batteries, and full breadboards. Arduino pins, component terminals, and all 420 breadboard holes can be connected freely. Clicking a terminal starts a live wire that follows the pointer until another terminal is selected. Wires render in front of parts while their separate hit layer stays behind interactive controls. Each wire is independent and selecting one highlights its complete electrical net.

Resizing or maximizing the Circuit panel expands the logical workspace without enlarging the Uno or circuit parts. The initial fit scale is retained for the session; when placed content extends beyond the viewport, the camera can pan across it instead of rescaling parts.

The Circuit camera supports pointer-centered mouse-wheel zoom from 40% to 250%. Dragging with the middle mouse button, or dragging an empty grid area with the left button, pans the complete connected circuit. Reset view restores the initial zoom and origin without changing component positions or wiring.

The mixed logic/DC solver models Uno output resistance and pull-ups, 5V/3.3V rails, battery polarity and internal resistance, resistors, LED diode current, switches, voltage dividers, ADC voltage, and digital thresholds. Faults identify shorts, conflicting or reversed supplies, excessive LED or pin current, resistor power, servo supply voltage, and Uno input over-voltage.

## Hardware Boundaries

- A physical external LED needs a 220-330 ohm series resistor.
- The Circuit pushbutton connects the selected input to GND and should use `INPUT_PULLUP`.
- Potentiometer and light-sensor ADC values follow their actual VCC, GND, and signal connections.
- A servo should use a suitable external 5V supply with a shared Uno ground.
- A physical WS2812B strip should use a regulated external 5V supply with shared ground, a 300-500 ohm resistor on DIN, and appropriate bulk decoupling. The simulator limits a strip to 60 visible pixels and flags an Uno 5V load above its conservative current budget.
- I2C, external SPI devices, SD cards, LCD output, stepper motion, EEPROM persistence, and capacitive sensing can compile and upload but are not currently simulated.
- Breadboard A-E and F-J terminal strips are separated by the center groove; each power rail is split between columns 15 and 16.
- Circuit is an educational DC and digital simulator, not a full SPICE transient, thermal, tolerance, capacitor, transistor, or inductive-load simulator.

## Electrical Network

The circuit is stored as parts, terminals, and free wires. Union-Find topology resolves shared nodes, including internal breadboard connections, and a nodal solver computes voltage and current only for active nets. Unused breadboard holes do not add matrix cost. The AVR worker feeds output pin states into the network and writes solved digital and analog inputs back to the ATmega328P simulation.

## License

The application source is available under the [MIT License](LICENSE). Bundled third-party code, generated Arduino examples, and libraries retain their own licenses; see `THIRD_PARTY_NOTICES.md` and the accompanying license files.

Arduino is a trademark of Arduino SA. This independent educational project is not affiliated with or endorsed by Arduino.
