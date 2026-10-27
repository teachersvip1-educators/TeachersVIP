import { describe, expect, it } from 'vitest'
import { normalizeUsCity } from './us-city'

describe('US city and state', () => {
  it.each([
    ['Houston, TX', 'Houston, Texas'],
    ['Austin, Texas, United States', 'Austin, Texas'],
    ['Washington, DC', 'Washington, District of Columbia'],
    ['New York, new york', 'New York, New York'],
  ])('normalizes %s', (input, expected) => expect(normalizeUsCity(input)).toBe(expected))
  it.each(['Toronto, Ontario', 'London, England', 'Houston', 'Paris, France', 'Houston, Texas, Canada', ', Texas'])('rejects %s', input => expect(normalizeUsCity(input)).toBeNull())
})
