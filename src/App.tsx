import Editor, { type Monaco } from '@monaco-editor/react'
import {
  BookOpen,
  Cable,
  Calculator,
  Check,
  ChevronDown,
  CircuitBoard,
  CircleStop,
  Clock3,
  Cpu,
  ExternalLink,
  FileCode2,
  FolderOpen,
  GitBranch,
  GripVertical,
  Hammer,
  Library,
  Lightbulb,
  LogIn,
  LogOut,
  Music2,
  Play,
  Repeat2,
  RotateCcw,
  Save,
  Search,
  Send,
  Sparkles,
  SquareTerminal,
  Upload,
  Usb,
  Variable,
  X,
} from 'lucide-react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { arduinoCompletionCount, registerArduinoAutocomplete } from './arduinoAutocomplete'
import { defaultExample, findExample } from './examples'
import {
  circuitComponentNames,
  emptyCircuitDesign,
  terminalId,
  updateCircuitPart,
  type CircuitDesign,
  type CircuitPartInstance,
} from './circuit'
import { CircuitCanvas } from './components/CircuitCanvas'
import { ConsoleOutput } from './components/ConsoleOutput'
import { ExampleLibrary } from './components/ExampleLibrary'
import { HardwarePanel } from './components/HardwarePanel'
import { circuitHardwareDiagnostics, codeDiagnostics } from './diagnostics'
import { solveElectricalCircuit } from './electrical'
import { prepareSnippet, snippets, type Snippet } from './snippets'
import type { SimulationState, WorkerCommand, WorkerEvent } from './simulator/types'
import { toolboxCategories, toolboxCategoryForSnippet, type ToolboxCategoryId } from './toolbox'
import './App.css'

const toolboxIcons = {
  basics: Sparkles,
  input: LogIn,
  output: LogOut,
  'led-strip': Lightbulb,
  time: Clock3,
  logic: GitBranch,
  loops: Repeat2,
  variables: Variable,
  math: Calculator,
  serial: SquareTerminal,
  'sound-motion': Music2,
  libraries: Library,
} as const
const blankState: SimulationState = {
  digitalPins: Array.from({ length: 20 }, () => false),
  analogValues: Array.from({ length: 6 }, () => 0),
  cycles: 0,
  virtualMillis: 0,
  partOutputs: {},
  ws2812Colors: {},
  terminalVoltages: {},
  faults: [],
  baudRate: 0,
}

function stoppedCircuitState(design: CircuitDesign): SimulationState {
  const result = solveElectricalCircuit(
    design,
    Array.from({ length: 20 }, (_, pin) => ({ pin, output: false, high: false, pullup: false })),
  )
  return {
    ...blankState,
    analogValues: result.analogVoltages.map((voltage) => Math.round((voltage / 5) * 1023)),
    partOutputs: result.partOutputs,
    terminalVoltages: result.terminalVoltages,
    faults: result.faults,
  }
}

type BuildState = 'idle' | 'compiling' | 'success' | 'error'

function formatBuildOutput(result: CompileResult) {
  const text = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
  return text || (result.ok ? 'Compilation completed successfully.' : 'Compilation failed.')
}

type SnippetCardProps = {
  snippet: Snippet
  color: string
  onActivate: (snippet: Snippet) => void
}

function SnippetCard({ snippet, color, onActivate }: SnippetCardProps) {
  return (
    <div
      className="snippet"
      data-snippet-id={snippet.id}
      draggable
      role="listitem"
      tabIndex={0}
      title={`Drag ${snippet.label} into the editor`}
      style={{ '--snippet-color': color } as CSSProperties}
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-arduino-snippet', snippet.id)
        event.dataTransfer.effectAllowed = 'copy'
        onActivate(snippet)
      }}
      onMouseEnter={() => onActivate(snippet)}
      onFocus={() => onActivate(snippet)}
    >
      <span>{snippet.label}</span>
      <small>{snippet.level}</small>
    </div>
  )
}

function App() {
  const [code, setCode] = useState<string>(defaultExample.code)
  const codeRef = useRef(code)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const autocompleteDisposableRef = useRef<{ dispose(): void } | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const compiledHexRef = useRef('')
  const compilePromiseRef = useRef<Promise<string | null> | null>(null)
  const runStartingRef = useRef(false)
  const runRequestRef = useRef(0)
  const circuitDesignRef = useRef<CircuitDesign>(emptyCircuitDesign)
  const [hasCompiled, setHasCompiled] = useState(false)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [fileName, setFileName] = useState('arduino-project.ino')
  const [dirty, setDirty] = useState(false)
  const [runtime, setRuntime] = useState<RuntimeStatus>({ ready: false, version: '', message: 'Checking compiler...' })
  const [buildState, setBuildState] = useState<BuildState>('idle')
  const [buildOutput, setBuildOutput] = useState('Ready to compile for Arduino Uno.')
  const [running, setRunning] = useState(false)
  const [runStarting, setRunStarting] = useState(false)
  const [simulation, setSimulation] = useState(blankState)
  const [serialOutput, setSerialOutput] = useState('')
  const [serialInput, setSerialInput] = useState('')
  const [circuitDesign, setCircuitDesign] = useState<CircuitDesign>(emptyCircuitDesign)
  const [toolboxCategory, setToolboxCategory] = useState<ToolboxCategoryId>('basics')
  const [toolboxQuery, setToolboxQuery] = useState('')
  const [activeSnippet, setActiveSnippet] = useState<Snippet>(() => snippets.find((snippet) => snippet.id === 'setup-loop') || snippets[0])
  const [rightTab, setRightTab] = useState<'circuit' | 'lab' | 'serial' | 'hardware'>('circuit')
  const [rightPanelWidth, setRightPanelWidth] = useState(430)
  const [resizingPanel, setResizingPanel] = useState(false)
  const [circuitExpanded, setCircuitExpanded] = useState(false)
  const [examplesOpen, setExamplesOpen] = useState(false)
  const [hardwarePorts, setHardwarePorts] = useState<HardwarePort[]>([])
  const [selectedHardwarePort, setSelectedHardwarePort] = useState('')
  const [hardwareScanning, setHardwareScanning] = useState(false)
  const [hardwareConnectionMessage, setHardwareConnectionMessage] = useState('No USB serial device detected.')
  const [hardwareUploading, setHardwareUploading] = useState(false)
  const [hardwareUploadOutput, setHardwareUploadOutput] = useState('')
  const [hardwareSerialConnected, setHardwareSerialConnected] = useState(false)
  const [hardwareSerialConnecting, setHardwareSerialConnecting] = useState(false)
  const [hardwareSerialStatus, setHardwareSerialStatus] = useState('USB Serial disconnected.')
  const [hardwareSerialOutput, setHardwareSerialOutput] = useState('')
  const activeComponentTypes = useMemo(
    () => Array.from(new Set(circuitDesign.parts.map((part) => part.type))),
    [circuitDesign.parts],
  )

  useEffect(() => {
    codeRef.current = code
  }, [code])

  useEffect(() => {
    circuitDesignRef.current = circuitDesign
  }, [circuitDesign])

  useEffect(() => {
    if (!resizingPanel) return

    function resizePanel(event: PointerEvent) {
      setRightPanelWidth(clampRightPanelWidth(window.innerWidth - event.clientX))
    }

    function finishResize() {
      setResizingPanel(false)
    }

    document.body.classList.add('resizing-panels')
    window.addEventListener('pointermove', resizePanel)
    window.addEventListener('pointerup', finishResize)
    window.addEventListener('pointercancel', finishResize)
    return () => {
      document.body.classList.remove('resizing-panels')
      window.removeEventListener('pointermove', resizePanel)
      window.removeEventListener('pointerup', finishResize)
      window.removeEventListener('pointercancel', finishResize)
    }
  }, [resizingPanel])

  useEffect(() => {
    function keepPanelsInView() {
      setRightPanelWidth((current) => clampRightPanelWidth(current))
    }

    window.addEventListener('resize', keepPanelsInView)
    return () => window.removeEventListener('resize', keepPanelsInView)
  }, [])

  useEffect(() => {
    window.arduinoDesktop.getRuntimeStatus().then(setRuntime)
    refreshHardwarePorts()

    const unsubscribeHardwareSerial = window.arduinoDesktop.onHardwareSerial((event) => {
      if (event.type === 'data') {
        setHardwareSerialOutput((current) => `${current}${event.text}`.slice(-16_000))
      } else if (event.type === 'error') {
        setHardwareSerialStatus(event.message || 'USB Serial error.')
      } else {
        setHardwareSerialConnected(event.status === 'connected')
        setHardwareSerialConnecting(false)
        setHardwareSerialStatus(event.message)
      }
    })

    const worker = new Worker(new URL('./simulator/avr.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
      if (event.data.type === 'state') setSimulation(event.data.state)
      if (event.data.type === 'serial') {
        const nextSerialText = event.data.text
        setSerialOutput((current) => `${current}${nextSerialText}`.slice(-12_000))
      }
      if (event.data.type === 'started') {
        runStartingRef.current = false
        setRunStarting(false)
        setRunning(true)
      }
      if (event.data.type === 'stopped') setRunning(false)
      if (event.data.type === 'error') {
        runStartingRef.current = false
        setRunStarting(false)
        setRunning(false)
        setBuildState('error')
        setBuildOutput(`Simulator error: ${event.data.message}`)
      }
    }
    workerRef.current = worker
    return () => {
      unsubscribeHardwareSerial()
      window.arduinoDesktop.stopHardwareSerial()
      autocompleteDisposableRef.current?.dispose()
      worker.terminate()
    }
  }, [])

  const activeToolboxCategory = toolboxCategories.find((item) => item.id === toolboxCategory) || toolboxCategories[0]
  const visibleSnippets = activeToolboxCategory.snippetIds
    .map((id) => snippets.find((snippet) => snippet.id === id))
    .filter((snippet): snippet is Snippet => Boolean(snippet))
  const searchResults = useMemo(() => {
    const query = toolboxQuery.trim().toLowerCase()
    if (!query) return []
    return snippets.filter((snippet) => `${snippet.label} ${snippet.description} ${snippet.code}`.toLowerCase().includes(query))
  }, [toolboxQuery])

  function selectToolboxCategory(nextCategory: ToolboxCategoryId) {
    const category = toolboxCategories.find((item) => item.id === nextCategory)
    if (!category) return
    setToolboxCategory(nextCategory)
    setToolboxQuery('')
    const first = snippets.find((snippet) => snippet.id === category.snippetIds[0])
    if (first) setActiveSnippet(first)
  }

  function setEditorCode(nextCode: string, nextName = fileName, nextPath: string | null = filePath) {
    setCode(nextCode)
    codeRef.current = nextCode
    setFileName(nextName)
    setFilePath(nextPath)
    setDirty(false)
    compiledHexRef.current = ''
    setHasCompiled(false)
    setBuildState('idle')
    setBuildOutput('Code changed. Compile to create a new Arduino Uno program.')
  }

  function handleEditorMount(editor: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) {
    editorRef.current = editor
    autocompleteDisposableRef.current?.dispose()
    autocompleteDisposableRef.current = registerArduinoAutocomplete(monaco)
    const domNode = editor.getDomNode()
    if (!domNode) return

    domNode.addEventListener('dragover', (event) => {
      if (event.dataTransfer?.types.includes('application/x-arduino-snippet')) {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }
    }, true)

    domNode.addEventListener('drop', (event) => {
      const snippetId = event.dataTransfer?.getData('application/x-arduino-snippet')
      const snippet = snippets.find((item) => item.id === snippetId)
      if (!snippet) return
      event.preventDefault()
      event.stopPropagation()

      const model = editor.getModel()
      const target = editor.getTargetAtClientPoint(event.clientX, event.clientY)
      if (!model) return
      const position = target?.position ?? editor.getPosition() ?? { lineNumber: model.getLineCount(), column: 1 }
      const offset = model.getOffsetAt(position)
      const prepared = prepareSnippet(codeRef.current, snippet, offset)
      editor.setValue(prepared.code)
      editor.setPosition(model.getPositionAt(prepared.cursor))
      editor.focus()
      setActiveSnippet(snippet)
    }, true)
  }

  function postWorker(command: WorkerCommand) {
    workerRef.current?.postMessage(command)
  }

  function stopSimulation() {
    runRequestRef.current += 1
    runStartingRef.current = false
    setRunStarting(false)
    postWorker({ type: 'stop' })
    setRunning(false)
    setSimulation(stoppedCircuitState(circuitDesignRef.current))
  }

  function compileCode() {
    if (!runtime.ready) {
      setBuildState('error')
      setBuildOutput(runtime.message || 'Arduino compiler is unavailable.')
      return Promise.resolve(null)
    }
    if (compilePromiseRef.current) return compilePromiseRef.current

    const compilePromise = (async () => {
      setBuildState('compiling')
      setBuildOutput('Compiling for Arduino Uno...')
      const source = codeRef.current
      try {
        const result = await window.arduinoDesktop.compile(source)
        const diagnostics = result.ok ? [...codeDiagnostics(source), ...circuitHardwareDiagnostics(activeComponentTypes)] : []
        setBuildOutput([formatBuildOutput(result), ...diagnostics].filter(Boolean).join('\n\n'))
        setBuildState(result.ok ? 'success' : 'error')
        if (!result.ok) return null
        compiledHexRef.current = result.hex
        setHasCompiled(true)
        setDirty(false)
        return result.hex
      } catch (error) {
        setBuildState('error')
        setBuildOutput(`Compilation could not start: ${String(error instanceof Error ? error.message : error)}`)
        return null
      } finally {
        compilePromiseRef.current = null
      }
    })()
    compilePromiseRef.current = compilePromise
    return compilePromise
  }

  async function runSketch() {
    if (!runtime.ready || runStartingRef.current) return
    const request = runRequestRef.current + 1
    runRequestRef.current = request
    runStartingRef.current = true
    setRunStarting(true)
    postWorker({ type: 'stop' })
    setRunning(false)
    setSimulation(blankState)
    const hex = !dirty && compiledHexRef.current ? compiledHexRef.current : await compileCode()
    if (request !== runRequestRef.current) return
    if (!hex) {
      runStartingRef.current = false
      setRunStarting(false)
      return
    }
    setSerialOutput('')
    setSimulation(blankState)
    postWorker({ type: 'start', hex, design: circuitDesignRef.current })
  }

  async function refreshHardwarePorts() {
    setHardwareScanning(true)
    const result = await window.arduinoDesktop.listHardwarePorts()
    setHardwarePorts(result.ports)
    setHardwareConnectionMessage(result.message)
    setSelectedHardwarePort((current) => {
      if (result.ports.some((port) => port.address === current)) return current
      return (result.ports.find((port) => port.isUno) || result.ports[0])?.address || ''
    })
    setHardwareScanning(false)
  }

  async function selectHardwarePort(port: string) {
    if (port !== selectedHardwarePort && (hardwareSerialConnected || hardwareSerialConnecting)) {
      await disconnectHardwareSerial()
    }
    setSelectedHardwarePort(port)
  }

  async function uploadToHardware() {
    if (!runtime.ready || hardwareUploading) return
    if (!selectedHardwarePort) {
      setRightTab('hardware')
      await refreshHardwarePorts()
      return
    }
    stopSimulation()
    if (hardwareSerialConnected || hardwareSerialConnecting) await disconnectHardwareSerial()
    setRightTab('hardware')
    setHardwareUploading(true)
    setBuildState('compiling')
    setBuildOutput(`Compiling and uploading to ${selectedHardwarePort}...`)
    setHardwareUploadOutput(`Preparing Arduino Uno upload on ${selectedHardwarePort}...`)
    const source = codeRef.current
    const result = await window.arduinoDesktop.uploadToUno({ code: source, port: selectedHardwarePort })
    const uploadResult = [result.stderr, result.stdout].filter(Boolean).join('\n').trim() || (result.ok ? 'Upload completed successfully.' : 'Upload failed.')
    const diagnostics = result.ok ? [...codeDiagnostics(source), ...circuitHardwareDiagnostics(activeComponentTypes)] : []
    const output = [uploadResult, ...diagnostics].filter(Boolean).join('\n\n')
    setHardwareUploadOutput(output)
    setBuildOutput(output)
    setBuildState(result.ok ? 'success' : 'error')
    if (result.ok) setDirty(false)
    setHardwareUploading(false)
  }

  async function connectHardwareSerial(baudRate: number) {
    if (!selectedHardwarePort || hardwareSerialConnecting) return
    stopSimulation()
    setHardwareSerialConnecting(true)
    setHardwareSerialStatus(`Opening ${selectedHardwarePort}...`)
    const result = await window.arduinoDesktop.startHardwareSerial({ port: selectedHardwarePort, baudRate })
    if (!result.ok) {
      setHardwareSerialConnecting(false)
      setHardwareSerialConnected(false)
      setHardwareSerialStatus(result.message || 'Unable to open USB Serial.')
    }
  }

  async function disconnectHardwareSerial() {
    await window.arduinoDesktop.stopHardwareSerial()
    setHardwareSerialConnected(false)
    setHardwareSerialConnecting(false)
    setHardwareSerialStatus('USB Serial disconnected.')
  }

  async function sendHardwareSerial(text: string) {
    const result = await window.arduinoDesktop.writeHardwareSerial(text)
    if (!result.ok) setHardwareSerialStatus(result.message || 'Unable to send serial data.')
  }

  function resetSimulation() {
    if (!compiledHexRef.current) return
    stopSimulation()
    setTimeout(() => {
      setSerialOutput('')
      setRunning(true)
      postWorker({ type: 'start', hex: compiledHexRef.current, design: circuitDesignRef.current })
    }, 20)
  }

  async function openSketch() {
    const result = await window.arduinoDesktop.openSketch()
    if (result?.code !== undefined) {
      stopSimulation()
      setEditorCode(result.code, result.name, result.filePath)
    }
  }

  async function saveSketch(forceNewPath = false) {
    const result = await window.arduinoDesktop.saveSketch({ filePath: forceNewPath ? null : filePath, code: codeRef.current })
    if (result) {
      setFilePath(result.filePath)
      setFileName(result.name)
      setDirty(false)
    }
  }

  function loadExample(id: string) {
    const example = findExample(id)
    if (!example) return
    stopSimulation()
    setEditorCode(example.code, example.fileName, null)
    setExamplesOpen(false)
  }

  function updateCircuitDesign(nextDesign: CircuitDesign) {
    circuitDesignRef.current = nextDesign
    setCircuitDesign(nextDesign)
    postWorker({ type: 'design', design: nextDesign })
    if (!running && !runStartingRef.current) setSimulation(stoppedCircuitState(nextDesign))
  }

  function updateCircuitComponent(instanceId: string, patch: Partial<CircuitPartInstance>) {
    updateCircuitDesign(updateCircuitPart(circuitDesign, instanceId, patch))
  }

  function labComponentLabel(part: CircuitPartInstance) {
    const peers = circuitDesign.parts.filter((item) => item.type === part.type)
    if (peers.length === 1) return circuitComponentNames[part.type]
    return `${circuitComponentNames[part.type]} ${peers.findIndex((item) => item.instanceId === part.instanceId) + 1}`
  }

  function sendSerial() {
    if (!serialInput || !running) return
    postWorker({ type: 'serial', text: `${serialInput}\n` })
    setSerialInput('')
  }

  function clampRightPanelWidth(width: number) {
    const compactLayout = window.innerWidth <= 1250
    const libraryWidth = compactLayout ? 238 : 270
    const editorWidth = compactLayout ? 430 : 460
    const maximum = Math.max(330, window.innerWidth - libraryWidth - editorWidth - 8)
    return Math.round(Math.max(330, Math.min(maximum, width)))
  }

  function resizePanelWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    if (event.key === 'Home') return setRightPanelWidth(330)
    if (event.key === 'End') return setRightPanelWidth(clampRightPanelWidth(Number.POSITIVE_INFINITY))
    setRightPanelWidth((current) => clampRightPanelWidth(current + (event.key === 'ArrowLeft' ? 28 : -28)))
  }

  return (
    <main className={`app-shell ${circuitExpanded ? 'circuit-expanded' : ''}`}>
      <header className="app-header">
        <div className="brand">
          <Cpu aria-hidden="true" />
          <div>
            <strong>Arduino Uno Studio</strong>
            <span>Desktop learning lab</span>
          </div>
        </div>

        <div className="file-tools" role="toolbar" aria-label="File tools">
          <button className="icon-button" type="button" title="Open sketch" onClick={openSketch}><FolderOpen /></button>
          <button className="icon-button" type="button" title="Save sketch" onClick={() => saveSketch(false)}><Save /></button>
          <button className="text-button" type="button" title="Save as a new sketch" onClick={() => saveSketch(true)}>Save As</button>
          <button className="text-button examples-button" type="button" title="Open Arduino examples" onClick={() => setExamplesOpen(true)}><BookOpen />Examples</button>
        </div>

        <div className="run-tools" role="toolbar" aria-label="Build and simulation tools">
          <span className={`runtime-status ${runtime.ready ? 'ready' : 'missing'}`} title={runtime.version || runtime.message}>
            <span />{runtime.ready ? 'Compiler ready' : 'Compiler unavailable'}
          </span>
          <button className="action-button compile" type="button" disabled={!runtime.ready || buildState === 'compiling'} onClick={compileCode}>
            <Hammer />{buildState === 'compiling' ? 'Compiling' : 'Compile'}
          </button>
          <button className={`action-button run ${running ? 'running' : ''}`} type="button" title={running ? 'Restart simulation' : 'Compile and run in the simulator'} disabled={!runtime.ready || runStarting} onClick={runSketch}>
            <Play />{runStarting ? (buildState === 'compiling' ? 'Compiling' : 'Starting') : running ? 'Restart' : 'Run'}
          </button>
          <button className="action-button upload" type="button" title={selectedHardwarePort ? `Upload to ${selectedHardwarePort}` : 'Find an Arduino Uno USB port'} disabled={!runtime.ready || hardwareUploading || buildState === 'compiling'} onClick={uploadToHardware}>
            <Upload />{hardwareUploading ? 'Uploading' : 'Upload'}
          </button>
          <button className="icon-button" type="button" title="Stop simulation" disabled={!running} onClick={stopSimulation}><CircleStop /></button>
          <button className="icon-button" type="button" title="Reset simulation" disabled={!hasCompiled} onClick={resetSimulation}><RotateCcw /></button>
        </div>
      </header>

      <section
        className="workspace"
        style={{ '--right-panel-width': `${rightPanelWidth}px` } as CSSProperties}
      >
        <aside className="library-panel">
          <div className="panel-title">
            <span>ARDUINO TOOLBOX</span>
            <strong>Code Categories</strong>
          </div>
          <div className="toolbox-search">
            <Search aria-hidden="true" />
            <input aria-label="Search Arduino commands" placeholder="Search commands" value={toolboxQuery} onChange={(event) => setToolboxQuery(event.target.value)} />
            {toolboxQuery && <button type="button" title="Clear search" onClick={() => setToolboxQuery('')}><X /></button>}
          </div>
          <div className="toolbox-body">
            {toolboxQuery ? (
              <div className="toolbox-search-results" role="list">
                <div><Search /><strong>Search Results</strong><span>{searchResults.length}</span></div>
                {searchResults.map((snippet) => (
                  <SnippetCard
                    key={snippet.id}
                    snippet={snippet}
                    color={toolboxCategoryForSnippet(snippet.id)?.color || 'var(--teal)'}
                    onActivate={setActiveSnippet}
                  />
                ))}
                {searchResults.length === 0 && <p>No commands found.</p>}
              </div>
            ) : (
              <div className="toolbox-categories" role="list" aria-label="Arduino code categories">
                {toolboxCategories.map((item) => {
                  const Icon = toolboxIcons[item.id]
                  const expanded = toolboxCategory === item.id
                  return <section className={`toolbox-category ${expanded ? 'active' : ''}`} style={{ '--toolbox-color': item.color } as CSSProperties} key={item.id}>
                    <button
                      type="button"
                      data-toolbox-category={item.id}
                      aria-expanded={expanded}
                      onClick={() => selectToolboxCategory(item.id)}
                    >
                      <span><Icon /></span><strong>{item.label}</strong><small>{item.snippetIds.length}</small><ChevronDown />
                    </button>
                    {expanded && <div className="toolbox-drawer" role="list">
                      {visibleSnippets.map((snippet) => <SnippetCard key={snippet.id} snippet={snippet} color={item.color} onActivate={setActiveSnippet} />)}
                    </div>}
                  </section>
                })}
              </div>
            )}
          </div>
          <div className="snippet-info">
            <div><strong>{activeSnippet.label}</strong><span>{activeSnippet.level}</span></div>
            <p>{activeSnippet.description}</p>
            <button type="button" onClick={() => window.arduinoDesktop.openExternal(activeSnippet.referenceUrl)}>
              Official reference <ExternalLink />
            </button>
          </div>
        </aside>

        <section className="editor-panel">
          <div className="editor-heading">
            <div>
              <span>CODE EDITOR</span>
              <strong><FileCode2 />{fileName}{dirty ? ' *' : ''}</strong>
            </div>
            <span>Arduino Uno · C++</span>
          </div>
          <div className="monaco-shell" data-autocomplete-count={arduinoCompletionCount}>
            <Editor
              height="100%"
              language="cpp"
              theme="vs-dark"
              value={code}
              onMount={handleEditorMount}
              onChange={(value) => {
                const next = value ?? ''
                setCode(next)
                codeRef.current = next
                setDirty(true)
              }}
              options={{
                automaticLayout: true,
                minimap: { enabled: false },
                fontFamily: "'Cascadia Code', Consolas, monospace",
                fontSize: 14,
                lineHeight: 22,
                padding: { top: 12 },
                scrollBeyondLastLine: false,
                quickSuggestions: { other: true, comments: false, strings: false },
                quickSuggestionsDelay: 60,
                suggestOnTriggerCharacters: true,
                acceptSuggestionOnEnter: 'on',
                tabCompletion: 'on',
                snippetSuggestions: 'top',
                suggest: { showWords: false },
                tabSize: 2,
                wordWrap: 'off',
              }}
            />
          </div>
          <section className="build-console" aria-label="Build output">
            <div>
              <span><SquareTerminal />BUILD OUTPUT</span>
              <span className={`build-result ${buildState}`}>
                {buildState === 'success' && <Check />}{buildState.toUpperCase()}
              </span>
            </div>
            <ConsoleOutput text={buildOutput} />
          </section>
        </section>

        <div
          className={`panel-resizer ${resizingPanel ? 'active' : ''}`}
          role="separator"
          aria-label="Resize circuit panel"
          aria-orientation="vertical"
          aria-valuemin={330}
          aria-valuenow={rightPanelWidth}
          tabIndex={0}
          title="Drag to resize the circuit panel. Double-click to reset."
          onPointerDown={(event) => {
            event.preventDefault()
            setResizingPanel(true)
          }}
          onDoubleClick={() => setRightPanelWidth(clampRightPanelWidth(430))}
          onKeyDown={resizePanelWithKeyboard}
        >
          <GripVertical aria-hidden="true" />
        </div>

        <aside className="simulation-panel">
          <div className="panel-tabs" role="tablist">
            <button data-right-tab="circuit" type="button" className={rightTab === 'circuit' ? 'active' : ''} onClick={() => setRightTab('circuit')}><CircuitBoard />Circuit</button>
            <button data-right-tab="lab" type="button" className={rightTab === 'lab' ? 'active' : ''} onClick={() => setRightTab('lab')}><Cpu />Uno Lab</button>
            <button data-right-tab="serial" type="button" className={rightTab === 'serial' ? 'active' : ''} onClick={() => setRightTab('serial')}><Usb />Serial</button>
            <button data-right-tab="hardware" type="button" className={rightTab === 'hardware' ? 'active' : ''} onClick={() => {
              setRightTab('hardware')
              refreshHardwarePorts()
            }}><Cable />Hardware</button>
          </div>

          {rightTab === 'circuit' ? (
            <CircuitCanvas
              design={circuitDesign}
              simulation={simulation}
              running={running}
              starting={runStarting}
              onDesignChange={updateCircuitDesign}
              expanded={circuitExpanded}
              onToggleExpand={() => setCircuitExpanded((current) => !current)}
            />
          ) : rightTab === 'lab' ? (
            <div className="lab-content">
              <div className="simulation-status">
                <span className={running ? 'live' : ''} />
                <strong>{running ? 'RUNNING' : 'STOPPED'}</strong>
                <span>{simulation.virtualMillis.toLocaleString()} ms</span>
              </div>

              <div className="lab-uno-shell" aria-label="Arduino Uno pin state">
                <wokwi-arduino-uno
                  className="lab-uno-board"
                  led13={simulation.digitalPins[13]}
                  ledPower
                />
              </div>

              <div className="component-grid">
                {circuitDesign.parts.map((part) => {
                  const label = labComponentLabel(part)
                  const output = simulation.partOutputs[part.instanceId]
                  const pixelCount = Math.max(1, Math.min(60, Math.round(part.value)))
                  const stripSupply = Math.abs(
                    (simulation.terminalVoltages[terminalId(part.instanceId, 'VCC')] || 0)
                    - (simulation.terminalVoltages[terminalId(part.instanceId, 'GND')] || 0),
                  )
                  const stripPowered = stripSupply >= 3.5 && stripSupply <= 5.5
                  const pixelColors = Array.from(
                    { length: pixelCount },
                    (_, index) => stripPowered ? (simulation.ws2812Colors[part.instanceId]?.[index] || '#000000') : '#000000',
                  )
                  if (part.type === 'led') return <section className="component led-component" key={part.instanceId}>
                    <div><span>{label}</span><small>{(output?.voltage || 0).toFixed(1)}V</small></div>
                    <span className={`large-led ${output?.on ? 'on' : ''}`} />
                    <strong>{output?.on ? `${Math.round(output.current * 1000)}mA` : 'OFF'}</strong>
                  </section>
                  if (part.type === 'button') return <section className="component button-component" key={part.instanceId}>
                    <div><span>{label}</span><small>{(output?.voltage || 0).toFixed(1)}V</small></div>
                    <button
                      type="button"
                      aria-label={`Press ${label}`}
                      className={part.pressed ? 'pressed' : ''}
                      onPointerDown={() => updateCircuitComponent(part.instanceId, { pressed: true })}
                      onPointerUp={() => updateCircuitComponent(part.instanceId, { pressed: false })}
                      onPointerLeave={() => updateCircuitComponent(part.instanceId, { pressed: false })}
                    ><span /></button>
                    <strong>{part.pressed ? 'CLOSED' : 'OPEN'}</strong>
                  </section>
                  if (part.type === 'potentiometer' || part.type === 'photoresistor') return <section className="component pot-component" key={part.instanceId}>
                    <div><span>{label}</span><small>{(output?.voltage || 0).toFixed(2)}V</small></div>
                    <input
                      type="range"
                      min="0"
                      max="1023"
                      value={part.value}
                      aria-label={`${label} value`}
                      onChange={(event) => updateCircuitComponent(part.instanceId, { value: Number(event.target.value) })}
                    />
                    <strong>{part.value}</strong>
                  </section>
                  if (part.type === 'ultrasonic') return <section className="component ultrasonic-component" key={part.instanceId}>
                    <div><span>{label}</span><small>{output?.on ? 'POWERED' : 'OFF'}</small></div>
                    <span className="lab-ultrasonic-visual"><wokwi-hc-sr04 /></span>
                    <input
                      type="range"
                      min="2"
                      max="400"
                      value={part.value}
                      aria-label={`${label} distance in centimeters`}
                      onChange={(event) => updateCircuitComponent(part.instanceId, { value: Math.max(2, Math.min(400, Number(event.target.value))) })}
                    />
                    <strong>{part.value} cm</strong>
                  </section>
                  if (part.type === 'buzzer') return <section className="component buzzer-component" key={part.instanceId}>
                    <div><span>{label}</span><small>{(output?.voltage || 0).toFixed(1)}V</small></div>
                    <div className={output?.frequency ? 'buzzer sounding' : 'buzzer'}><span /><span /><span /></div>
                    <strong>{output?.frequency ? `${output.frequency} Hz` : 'OFF'}</strong>
                  </section>
                  if (part.type === 'servo') return <section className="component servo-component" key={part.instanceId}>
                    <div><span>{label}</span><small>PWM</small></div>
                    <div className="servo"><span style={{ transform: `translateX(-50%) rotate(${(output?.angle || 90) - 90}deg)` }} /></div>
                    <strong>{output?.angle || 90}°</strong>
                  </section>
                  if (part.type === 'ws2812b') return <section className="component ws2812b-component" key={part.instanceId}>
                    <div><span>{label}</span><small>{part.value} LEDs</small></div>
                    <span className="lab-ws2812b-visual">{pixelColors.map((color, index) => <i key={index} style={{ backgroundColor: color, boxShadow: color !== '#000000' ? `0 0 6px ${color}` : 'none' }} />)}</span>
                    <strong>{pixelColors.some((color) => color !== '#000000') ? 'ACTIVE' : 'OFF'}</strong>
                  </section>
                  if (part.type === 'breadboard') return <section className="component" key={part.instanceId}><div><span>{label}</span><small>420 holes</small></div><strong>CONNECTED STRIPS</strong></section>
                  return <section className="component" key={part.instanceId}><div><span>{label}</span><small>{part.type === 'battery' ? `${part.voltage}V` : `${part.resistance}Ω`}</small></div><strong>{part.type === 'battery' ? `${Math.round((output?.current || 0) * 1000)}mA` : `${Math.round(Math.abs(output?.current || 0) * 1000)}mA`}</strong></section>
                })}
              </div>
            </div>
          ) : rightTab === 'serial' ? (
            <div className="serial-content">
              <div className="serial-heading">
                <span>MONITOR</span>
                <strong>{simulation.baudRate ? `${simulation.baudRate} baud` : 'Waiting for Serial.begin'}</strong>
                <button type="button" onClick={() => setSerialOutput('')}>Clear</button>
              </div>
              <pre>{serialOutput || 'Serial output will appear here.'}</pre>
              <div className="serial-input">
                <input
                  value={serialInput}
                  disabled={!running}
                  placeholder="Send text to Arduino"
                  onChange={(event) => setSerialInput(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') sendSerial() }}
                />
                <button type="button" title="Send serial line" disabled={!running || !serialInput} onClick={sendSerial}><Send /></button>
              </div>
            </div>
          ) : (
            <HardwarePanel
              ports={hardwarePorts}
              selectedPort={selectedHardwarePort}
              scanning={hardwareScanning}
              connectionMessage={hardwareConnectionMessage}
              uploading={hardwareUploading}
              uploadOutput={hardwareUploadOutput}
              serialConnected={hardwareSerialConnected}
              serialConnecting={hardwareSerialConnecting}
              serialStatus={hardwareSerialStatus}
              serialOutput={hardwareSerialOutput}
              onSelectPort={selectHardwarePort}
              onRefresh={refreshHardwarePorts}
              onUpload={uploadToHardware}
              onConnectSerial={connectHardwareSerial}
              onDisconnectSerial={disconnectHardwareSerial}
              onSendSerial={sendHardwareSerial}
              onClearSerial={() => setHardwareSerialOutput('')}
            />
          )}
        </aside>
      </section>
      {examplesOpen && <ExampleLibrary onOpen={loadExample} onClose={() => setExamplesOpen(false)} />}
    </main>
  )
}

export default App
