export type ExampleCompatibility = 'uno' | 'board-specific'

export type ArduinoExample = {
  id: string
  name: string
  fileName: string
  category: string
  collection: 'Studio Lab' | 'Arduino Built-in' | 'Bundled Library'
  compatibility: ExampleCompatibility
  code: string
  sourceUrl?: string
}
