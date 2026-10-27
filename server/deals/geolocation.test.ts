import { describe, expect, it } from 'vitest'
import { haversineDistanceM, validateProximity } from './geolocation.js'

const target = { latitude: 40, longitude: -75 }
const now = new Date('2026-09-06T12:00:00.000Z')

describe('deal geolocation validation', () => {
  it('calculates a zero-distance point and accepts a confident inside reading', () => {
    expect(haversineDistanceM(target, target)).toBe(0)
    const result = validateProximity({ observation: { ...target, accuracyM: 5, observedAt: now }, target, radiusM: 150, now })
    expect(result).toMatchObject({ decision: 'inside', distanceM: 0, accuracyM: 5 })
  })

  it('does not classify a stale browser reading as outside', () => {
    const result = validateProximity({ observation: { ...target, accuracyM: 5, observedAt: '2026-09-06T11:56:00.000Z' }, target, radiusM: 150, now })
    expect(result.decision).toBe('stale')
  })

  it('returns low_accuracy when the uncertainty overlaps the boundary', () => {
    const result = validateProximity({ observation: { latitude: 40.0012, longitude: -75, accuracyM: 100, observedAt: now }, target, radiusM: 150, now })
    expect(result.decision).toBe('low_accuracy')
  })

  it('returns outside only when the accuracy circle is clearly beyond the radius', () => {
    const result = validateProximity({ observation: { latitude: 40.01, longitude: -75, accuracyM: 10, observedAt: now }, target, radiusM: 150, now })
    expect(result.decision).toBe('outside')
  })

  it('rejects impossible coordinates and future observations', () => {
    expect(validateProximity({ observation: { latitude: 140, longitude: -75, accuracyM: 5, observedAt: now }, target, radiusM: 150, now }).decision).toBe('invalid')
    expect(validateProximity({ observation: { ...target, accuracyM: 5, observedAt: '2026-09-06T12:05:00.000Z' }, target, radiusM: 150, now }).decision).toBe('invalid')
  })
  it('requires a fresh reading with positive accuracy and tolerates only small clock skew', () => {
    const check = (accuracyM: number, observedAt: string) => validateProximity({ observation: { ...target, accuracyM, observedAt }, target, radiusM: 150, now }).decision
    expect(check(5, '2026-09-06T11:59:15.000Z')).toBe('stale')
    expect(check(5, '2026-09-06T12:00:06.000Z')).toBe('invalid')
    expect(check(5, '2026-09-06T12:00:04.000Z')).toBe('inside')
    expect(check(0, now.toISOString())).toBe('invalid')
  })
  it('fails closed for an invalid server clock or freshness policy', () => {
    const input = { observation: { ...target, accuracyM: 5, observedAt: now }, target, radiusM: 150, now }
    expect(validateProximity({ ...input, now: new Date(Number.NaN) }).decision).toBe('invalid')
    expect(validateProximity({ ...input, maxAgeMs: Number.NaN }).decision).toBe('invalid')
  })
})
