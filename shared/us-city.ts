const states = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois',
  'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts',
  'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
  'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming',
]
const codes = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ')

/** Accept manual US city/state entry as well as older labels containing the country. */
export function normalizeUsCity(value: string): string | null {
  const parts = value.trim().split(',').map(part => part.trim())
  if (parts.length === 3 && /^(United States(?: of America)?|US|USA)$/i.test(parts[2])) parts.pop()
  if (parts.length !== 2 || !parts[0]) return null
  const stateIndex = states.findIndex((state, index) =>
    state.toLowerCase() === parts[1].toLowerCase() || codes[index] === parts[1].toUpperCase(),
  )
  return stateIndex < 0 ? null : `${parts[0]}, ${states[stateIndex]}`
}
