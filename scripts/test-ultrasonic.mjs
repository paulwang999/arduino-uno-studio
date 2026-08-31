import assert from 'node:assert/strict'
import {
  ULTRASONIC_ECHO_MICROS_PER_CM,
  ULTRASONIC_RESPONSE_DELAY_MICROS,
  UltrasonicPulseScheduler,
} from '../src/simulator/ultrasonic.ts'

const speedHz = 16_000_000
const cyclesPerMicrosecond = speedHz / 1_000_000
const scheduler = new UltrasonicPulseScheduler(speedHz)
scheduler.configure([{ partId: 'ultrasonic-1', triggerPin: 7, echoPin: 6 }])

scheduler.triggerEdge('ultrasonic-1', true, 1_000, 100, true)
scheduler.triggerEdge('ultrasonic-1', false, 1_159, 100, true)
assert.equal(scheduler.scheduledPulse('ultrasonic-1'), null, 'A trigger shorter than 10us must not create an echo.')

scheduler.triggerEdge('ultrasonic-1', true, 2_000, 100, true)
scheduler.triggerEdge('ultrasonic-1', false, 2_160, 100, true)
const pulse = scheduler.scheduledPulse('ultrasonic-1')
assert.ok(pulse)
assert.equal(pulse.echoPin, 6)
assert.equal(pulse.startCycle, 2_160 + ULTRASONIC_RESPONSE_DELAY_MICROS * cyclesPerMicrosecond)
assert.equal(pulse.endCycle - pulse.startCycle, 100 * ULTRASONIC_ECHO_MICROS_PER_CM * cyclesPerMicrosecond)

assert.deepEqual(scheduler.update(pulse.startCycle - 1), [])
assert.deepEqual(scheduler.update(pulse.startCycle), [{ pin: 6, high: true }])
assert.equal(scheduler.currentLevel(6), true)
assert.deepEqual(scheduler.update(pulse.endCycle - 1), [])
assert.deepEqual(scheduler.update(pulse.endCycle), [{ pin: 6, high: false }])
assert.equal(scheduler.currentLevel(6), false)

scheduler.triggerEdge('ultrasonic-1', true, 200_000, 50, false)
scheduler.triggerEdge('ultrasonic-1', false, 200_160, 50, false)
assert.equal(scheduler.scheduledPulse('ultrasonic-1'), null, 'An unpowered sensor must not create an echo.')

scheduler.configure([])
assert.equal(scheduler.currentLevel(6), false)

console.log('Ultrasonic timing tests passed: 10us trigger threshold, 58us/cm echo, power gating, and pin release are correct.')
