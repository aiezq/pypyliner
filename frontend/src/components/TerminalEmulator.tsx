import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { getWebSocketUrl } from '../lib/api'
import { TerminalSocketMessageSchema } from '../lib/schemas'

interface TerminalEmulatorProps {
  terminalId: string
  canWrite: boolean
  fallbackLines: string[]
}

const mapKeyboardEventToInput = (event: KeyboardEvent): string | null => {
  if (event.metaKey && event.key.toLowerCase() === 'v') {
    return null
  }
  if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.length === 1) {
    const upper = event.key.toUpperCase()
    if (upper >= 'A' && upper <= 'Z') {
      return String.fromCharCode(upper.charCodeAt(0) - 64)
    }
  }
  if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key.length === 1) {
    return event.key
  }

  switch (event.key) {
    case 'Enter':
      return '\r'
    case 'Backspace':
      return '\x7f'
    case 'Tab':
      return '\t'
    case 'Escape':
      return '\x1b'
    case 'ArrowUp':
      return '\x1b[A'
    case 'ArrowDown':
      return '\x1b[B'
    case 'ArrowRight':
      return '\x1b[C'
    case 'ArrowLeft':
      return '\x1b[D'
    case 'Delete':
      return '\x1b[3~'
    case 'Home':
      return '\x1b[H'
    case 'End':
      return '\x1b[F'
    default:
      return null
  }
}

function TerminalEmulator({ terminalId, canWrite, fallbackLines }: TerminalEmulatorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const desiredCanWriteRef = useRef(canWrite)
  const readOnlyRef = useRef(!canWrite)
  const serverReadOnlyRef = useRef(true)
  const snapshotReceivedRef = useRef(false)
  const serverSyncSeenRef = useRef(false)
  const renderedFallbackCountRef = useRef(0)

  useEffect(() => {
    desiredCanWriteRef.current = canWrite
    const term = terminalRef.current
    if (!term) {
      return
    }
    readOnlyRef.current = serverReadOnlyRef.current || !canWrite
    term.options.disableStdin = readOnlyRef.current
  }, [canWrite])

  const sendInput = (data: string): void => {
    const socket = socketRef.current
    if (
      !data ||
      !desiredCanWriteRef.current ||
      readOnlyRef.current ||
      socket === null ||
      socket.readyState !== WebSocket.OPEN
    ) {
      return
    }
    socket.send(
      JSON.stringify({
        type: 'input',
        data,
      }),
    )
  }

  const focusTerminal = (): void => {
    const container = containerRef.current
    container?.focus()
    terminalRef.current?.focus()
    const helperTextarea = container?.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')
    helperTextarea?.focus()
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      return undefined
    }

    const term = new XTerm({
      allowTransparency: true,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: 'bar',
      disableStdin: !canWrite,
      fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.18,
      scrollback: 5000,
      theme: {
        background: '#11161b',
        foreground: '#d6dee6',
        cursor: '#92c3ff',
        cursorAccent: '#11161b',
        selectionBackground: 'rgba(146, 195, 255, 0.22)',
      },
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    term.focus()
    fitAddon.fit()
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') {
        return true
      }
      const payload = mapKeyboardEventToInput(event)
      if (payload === null || !desiredCanWriteRef.current || readOnlyRef.current) {
        return true
      }
      event.preventDefault()
      sendInput(payload)
      return false
    })

    terminalRef.current = term

    const socket = new WebSocket(getWebSocketUrl(`/ws/terminals/${terminalId}`))
    socketRef.current = socket

    const sendResize = (): void => {
      if (socket.readyState !== WebSocket.OPEN || !snapshotReceivedRef.current) {
        return
      }
      socket.send(
        JSON.stringify({
          type: 'resize',
          cols: term.cols,
          rows: term.rows,
        }),
      )
    }

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      sendResize()
    })
    resizeObserver.observe(container)

    const handlePaste = (event: ClipboardEvent): void => {
      if (!desiredCanWriteRef.current || readOnlyRef.current) {
        return
      }
      const text = event.clipboardData?.getData('text') ?? ''
      if (!text) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      sendInput(text.replace(/\r\n/g, '\n'))
    }

    container.addEventListener('paste', handlePaste, true)

    socket.addEventListener('open', () => {
      fitAddon.fit()
      focusTerminal()
    })

    socket.addEventListener('message', (event) => {
      const parsed = TerminalSocketMessageSchema.safeParse(JSON.parse(event.data as string))
      if (!parsed.success) {
        return
      }

      if (parsed.data.type === 'snapshot') {
        serverSyncSeenRef.current = true
        snapshotReceivedRef.current = true
        serverReadOnlyRef.current = parsed.data.data.read_only
        readOnlyRef.current = parsed.data.data.read_only || !desiredCanWriteRef.current
        term.options.disableStdin = readOnlyRef.current
        term.reset()
        renderedFallbackCountRef.current = 0
        if (parsed.data.data.buffer) {
          term.write(parsed.data.data.buffer)
        }
        fitAddon.fit()
        sendResize()
        focusTerminal()
        return
      }

      if (parsed.data.type === 'data') {
        serverSyncSeenRef.current = true
        term.write(parsed.data.data)
        return
      }

      if (parsed.data.type === 'mode') {
        serverSyncSeenRef.current = true
        serverReadOnlyRef.current = parsed.data.data.read_only
        readOnlyRef.current = parsed.data.data.read_only || !desiredCanWriteRef.current
        term.options.disableStdin = readOnlyRef.current
        if (!readOnlyRef.current) {
          focusTerminal()
        }
        return
      }

      serverSyncSeenRef.current = true
      term.reset()
      renderedFallbackCountRef.current = 0
    })

    socket.addEventListener('close', () => {
      serverReadOnlyRef.current = true
      readOnlyRef.current = true
      term.options.disableStdin = true
      term.write('\r\n[terminal disconnected]\r\n')
    })

    return () => {
      resizeObserver.disconnect()
      container.removeEventListener('paste', handlePaste, true)
      socketRef.current = null
      socket.close()
      terminalRef.current = null
      term.dispose()
    }
  }, [terminalId])

  useEffect(() => {
    const term = terminalRef.current
    if (!term || serverSyncSeenRef.current || canWrite) {
      return
    }

    if (fallbackLines.length === 0) {
      if (renderedFallbackCountRef.current > 0) {
        term.reset()
        renderedFallbackCountRef.current = 0
      }
      return
    }

    const alreadyRendered = renderedFallbackCountRef.current
    const nextLines = fallbackLines.slice(alreadyRendered)
    if (nextLines.length === 0) {
      return
    }

    term.write(nextLines.map((line) => `${line}\r\n`).join(''))
    renderedFallbackCountRef.current = fallbackLines.length
  }, [canWrite, fallbackLines])

  return (
    <div
      ref={containerRef}
      className="terminalEmulator__viewport"
      tabIndex={0}
      onMouseDown={() => focusTerminal()}
    />
  )
}

export default TerminalEmulator
