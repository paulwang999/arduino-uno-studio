const path = require('node:path')
const fs = require('node:fs/promises')

const sketchExtensions = new Set(['.ino', '.cpp', '.h', '.txt'])

function sketchPathKey(filePath) {
  const resolved = path.resolve(filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function sketchPathsFromArguments(args, workingDirectory = process.cwd()) {
  const paths = new Map()
  for (const argument of args) {
    if (typeof argument !== 'string') continue
    const value = argument.replace(/^"(.*)"$/, '$1')
    if (value.startsWith('-') || !sketchExtensions.has(path.extname(value).toLowerCase())) continue
    const filePath = path.resolve(workingDirectory, value)
    paths.set(sketchPathKey(filePath), filePath)
  }
  return [...paths.values()]
}

async function readSketch(filePath) {
  const resolved = path.resolve(filePath)
  const stat = await fs.stat(resolved)
  if (!stat.isFile()) throw new Error('The selected path is not a sketch file.')
  return { filePath: resolved, name: path.basename(resolved), code: await fs.readFile(resolved, 'utf8') }
}

module.exports = { readSketch, sketchPathKey, sketchPathsFromArguments }
