type ConsoleOutputProps = {
  text: string
  className?: string
}

function lineSeverity(line: string) {
  if (/\b(?:warning|limitation)\b/i.test(line)) return 'warning'
  if (/\berror\b/i.test(line)) return 'error'
  return ''
}

export function ConsoleOutput({ text, className }: ConsoleOutputProps) {
  const lines = text.split('\n')
  return (
    <pre className={className}>
      {lines.map((line, index) => {
        const severity = lineSeverity(line)
        return <span className={`console-output-line ${severity ? `console-output-${severity}` : ''}`} data-console-warning={severity === 'warning' || undefined} key={`${index}-${line}`}>{line}{index < lines.length - 1 ? '\n' : ''}</span>
      })}
    </pre>
  )
}
