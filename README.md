# Arduino Uno Studio

Arduino Uno Studio is a Windows desktop learning environment for Arduino Uno. It combines an English code editor, a searchable MakeCode-style toolbox of draggable Arduino commands, the official Uno compiler target, a component circuit workspace, AVR simulation, USB upload, and Serial Monitor.

## Highlights

- Drag beginner-friendly Arduino C++ commands into the editor, then edit real code.
- Use **Fix Code** to complete common punctuation mistakes and align Arduino C++ indentation.
- Undo and redo editor changes from the toolbar or with `Ctrl+Z` and `Ctrl+Y`.
- Double-click a saved `.ino` sketch to open its code. Each different sketch opens in its own window; opening the same file again focuses its existing window and preserves edits.
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
npm run code-fixer:test
npm run toolbox:test
npm run circuit:test
npm run electrical:test
npm run components:test
npm run oled:test
npm run ws2812:test
npm run ultrasonic:test
npm run sonar-api:test
npm run runtime:test
npm run simulator:test
npm run hardware:test
npm run file-open:test
npm run examples:test
```

### Interaction updates in 1.5.1

After selecting a wire in Circuit, press `Delete` to remove it. Delete is ignored while focus is in the code editor or an input control. Fix Code also joins comparison operators accidentally separated by spaces: `< =`, `> =`, `= =`, and `! =`. Strings and comments are preserved.

Both simulation and hardware upload compile for `arduino:avr:uno`. The simulator executes that compiled ATmega328P program and models digital I/O, Uno ADC inputs, timers, PWM-based servo output, tone output, USART Serial, and WS2812B data generated through FastLED.

Circuit supports any number of LEDs, WS2812B strips, pushbuttons, resistors, potentiometers, light sensor modules, HC-SR04 ultrasonic sensors, passive buzzers, servos, batteries, and full breadboards. Arduino pins, component terminals, and all 420 breadboard holes can be connected freely. Clicking a terminal starts a live wire that follows the pointer until another terminal is selected. Wires render in front of parts while their separate hit layer stays behind interactive controls. Each wire is independent and selecting one highlights its complete electrical net.

Resizing or maximizing the Circuit panel expands the logical workspace without enlarging the Uno or circuit parts. The initial fit scale is retained for the session; when placed content extends beyond the viewport, the camera can pan across it instead of rescaling parts.

The Circuit camera supports pointer-centered mouse-wheel zoom from 40% to 250%. Dragging with the middle mouse button, or dragging an empty grid area with the left button, pans the complete connected circuit. Reset view restores the initial zoom and origin without changing component positions or wiring.

The mixed logic/DC solver models Uno output resistance and pull-ups, 5V/3.3V rails, battery polarity and internal resistance, resistors, LED diode current, switches, voltage dividers, ADC voltage, and digital thresholds. Faults identify shorts, conflicting or reversed supplies, excessive LED or pin current, resistor power, servo supply voltage, and Uno input over-voltage.

## Hardware Boundaries

### OLED in 1.5.0

Circuit > + > Outputs includes an SSD1306 128x64 I2C OLED. Default wiring is GND to Uno GND, VCC to 5V, SDA to A4, SCL to A5. The model represents a 3.3-5V-compatible breakout with pull-ups, not a bare OLED panel. Check the physical module's rating before wiring a real board.

Output contains draggable OLED text and shapes snippets. Examples > Studio Lab includes a text/counter sketch and animated shapes. Adafruit SSD1306 2.5.17, GFX 1.12.6 and BusIO 1.17.4 are bundled for offline compilation and hardware upload. Typing `display.` (or another declared SSD1306 object name) offers common display methods.

The real AVR hardware TWI peripheral drives an SSD1306 command decoder and 1024-byte display RAM. Horizontal, vertical and page addressing, text/graphics, inversion, display on/off and software animation are supported. The part address can be 0x3C or 0x3D and must match the sketch. Two addresses can share A4/A5; duplicate addresses report a conflict and are rejected. Power loss resets the display; reconnect and restart the sketch to initialize it again. An I2C data-line disconnect stops updates but retains the last displayed image, as on a powered panel.

Hardware scrolling, SPI OLEDs, SH1106/128x32 panels, bit-banged I2C, bus capacitance/clock stretching and detailed OLED current consumption are not modeled. Hardware scrolling emits an explicit simulation warning. Two Adafruit framebuffers alone use all 2048 bytes of Uno SRAM, so do not allocate two full-buffer displays on an Uno. Wiring multiple displays does not make extra MCU RAM available.

`oled:test` checks controller addressing, wiring, power, conflicts, real compiled Adafruit sketches, changing frame pixels and Wire scanner ACK/NACK behavior. `scripts/test-oled-ui.mjs` checks desktop interactions and screenshots with an isolated profile; set `STUDIO_PLAYWRIGHT` to a Playwright installation and optionally `STUDIO_EXE` to a packaged executable. Physical hardware has not been verified by these automated tests.

### New Components in 1.4.0

Circuit, Uno Lab, the Input/Output toolbox and Studio Lab examples include:

| Part | Default/example wiring | Model |
| --- | --- | --- |
| PIR motion sensor | VCC 5V, GND, OUT D4 | Powered 3.3V digital output controlled by Motion |
| NTC temperature module | VCC 5V, GND, OUT A0 | 10K fixed resistor above a 10K NTC, beta 3950, -40 to 125 C |
| SPDT slide switch | 1 GND, 2 D2, 3 5V | Common 2 switches between 1 and 3 |
| Analog joystick | VCC 5V, GND, HORZ A0, VERT A1, SEL D2 | Two 10K dividers and a switch to ground; SEL uses INPUT_PULLUP |
| Common-cathode RGB LED | COM GND; R/G/B to D9/D10/D11 through separate 220-ohm resistors | Three diode channels with overcurrent faults and time-averaged PWM color |

Default pin assignments use free pins; additional instances never silently reuse an occupied pin. Adjust code and wiring together when using multiple parts. RGB adds only the COM wire: place and connect the three resistors yourself. Example comments include wiring requirements; loading code does not replace an existing circuit.

The PIR model intentionally exposes a steady motion level, not a particular module's startup/hold/retrigger timing. Switches and the joystick button have ideal contacts without bounce. NTC tolerances, RGB spectral/forward-voltage differences and thermal behavior are not calibrated physical models. No new Arduino libraries are required for these five components. Peripheral visuals reuse the already bundled, licensed Wokwi Elements package; the simulation is our own electrical model connected to AVR8js.

### Existing Components

- A physical external LED needs a 220-330 ohm series resistor.
- The Circuit pushbutton connects the selected input to GND and should use `INPUT_PULLUP`.
- Potentiometer and light-sensor ADC values follow their actual VCC, GND, and signal connections.
- A servo should use a suitable external 5V supply with a shared Uno ground.
- A physical WS2812B strip should use a regulated external 5V supply with shared ground, a 300-500 ohm resistor on DIN, and appropriate bulk decoupling. The simulator limits a strip to 60 visible pixels and flags an Uno 5V load above its conservative current budget.
- I2C devices other than SSD1306, external SPI devices, SD cards, LCD output, stepper motion, EEPROM persistence, and capacitive sensing can compile and upload but are not currently simulated.
- Breadboard A-E and F-J terminal strips are separated by the center groove; each power rail is split between columns 15 and 16.
- Circuit is an educational DC and digital simulator, not a full SPICE transient, thermal, tolerance, capacitor, transistor, or inductive-load simulator.

## Electrical Network

The circuit is stored as parts, terminals, and free wires. Union-Find topology resolves shared nodes, including internal breadboard connections, and a nodal solver computes voltage and current only for active nets. Unused breadboard holes do not add matrix cost. The AVR worker feeds output pin states into the network and writes solved digital and analog inputs back to the ATmega328P simulation.

## License

The application source is available under the [MIT License](LICENSE). Bundled third-party code, generated Arduino examples, and libraries retain their own licenses; see `THIRD_PARTY_NOTICES.md` and the accompanying license files.

Arduino is a trademark of Arduino SA. This independent educational project is not affiliated with or endorsed by Arduino.
