export type ToolboxCategoryId =
  | 'basics'
  | 'input'
  | 'output'
  | 'led-strip'
  | 'time'
  | 'logic'
  | 'loops'
  | 'variables'
  | 'math'
  | 'serial'
  | 'sound-motion'
  | 'libraries'

export type ToolboxCategory = {
  id: ToolboxCategoryId
  label: string
  color: string
  snippetIds: string[]
}

export const toolboxCategories: ToolboxCategory[] = [
  { id: 'basics', label: 'Basics', color: '#2f9fbd', snippetIds: ['setup-loop', 'pin-mode'] },
  { id: 'input', label: 'Input', color: '#c65b91', snippetIds: ['digital-read', 'analog-read', 'ultrasonic-distance'] },
  { id: 'output', label: 'Output', color: '#d88932', snippetIds: ['digital-write', 'analog-write'] },
  { id: 'led-strip', label: 'LED Strip', color: '#b69a35', snippetIds: ['ws2812-solid', 'ws2812-rainbow'] },
  { id: 'time', label: 'Time', color: '#36977d', snippetIds: ['delay', 'millis'] },
  { id: 'logic', label: 'Logic', color: '#7c62bd', snippetIds: ['if-else'] },
  { id: 'loops', label: 'Loops', color: '#4b9862', snippetIds: ['for', 'while'] },
  { id: 'variables', label: 'Variables', color: '#bd5f59', snippetIds: ['int', 'bool', 'const'] },
  { id: 'math', label: 'Math', color: '#5279bd', snippetIds: ['map', 'constrain'] },
  { id: 'serial', label: 'Serial', color: '#607786', snippetIds: ['serial-begin', 'serial-println'] },
  { id: 'sound-motion', label: 'Sound & Motion', color: '#b96387', snippetIds: ['tone', 'servo-write', 'servo-sweep', 'stepper'] },
  { id: 'libraries', label: 'Libraries', color: '#6a789c', snippetIds: ['lcd', 'eeprom', 'sd'] },
]

export function toolboxCategoryForSnippet(snippetId: string) {
  return toolboxCategories.find((category) => category.snippetIds.includes(snippetId))
}
