import type {
  ArduinoUnoElement,
  BuzzerElement,
  HCSR04Element,
  LEDElement,
  PhotoresistorSensorElement,
  PotentiometerElement,
  PushbuttonElement,
  ServoElement,
} from '@wokwi/elements'
import type { ClassAttributes, HTMLAttributes } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'wokwi-arduino-uno': ClassAttributes<ArduinoUnoElement> &
        HTMLAttributes<ArduinoUnoElement> &
        Partial<ArduinoUnoElement>
      'wokwi-led': ClassAttributes<LEDElement> & HTMLAttributes<LEDElement> & Partial<LEDElement>
      'wokwi-pushbutton': ClassAttributes<PushbuttonElement> & HTMLAttributes<PushbuttonElement> & Partial<PushbuttonElement>
      'wokwi-potentiometer': ClassAttributes<PotentiometerElement> & HTMLAttributes<PotentiometerElement> & Partial<PotentiometerElement>
      'wokwi-photoresistor-sensor': ClassAttributes<PhotoresistorSensorElement> & HTMLAttributes<PhotoresistorSensorElement> & Partial<PhotoresistorSensorElement>
      'wokwi-buzzer': ClassAttributes<BuzzerElement> & HTMLAttributes<BuzzerElement> & Partial<BuzzerElement>
      'wokwi-hc-sr04': ClassAttributes<HCSR04Element> & HTMLAttributes<HCSR04Element> & Partial<HCSR04Element>
      'wokwi-servo': ClassAttributes<ServoElement> & HTMLAttributes<ServoElement> & Partial<ServoElement>
    }
  }
}
