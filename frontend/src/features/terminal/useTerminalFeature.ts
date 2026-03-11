import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useManualTerminalController } from '../../hooks/useManualTerminalController'
import { getWebSocketUrl } from '../../lib/api'
import { RuntimeSocketEventSchema } from '../../lib/schemas'

interface UseTerminalFeatureOptions {
  setBackendError: Dispatch<SetStateAction<string | null>>
}

export const useTerminalFeature = ({ setBackendError }: UseTerminalFeatureOptions) => {
  const manual = useManualTerminalController({
    setBackendError,
  })
  const reconnectTimeoutIdRef = useRef<number | null>(null)
  const socketEventContextGetterRef = useRef(manual.getSocketEventContext)
  const [requestedMinimizedTerminalWindowIds, setRequestedMinimizedTerminalWindowIds] =
    useState<string[]>([])
  const [isSocketConnected, setIsSocketConnected] = useState(false)

  useEffect(() => {
    socketEventContextGetterRef.current = manual.getSocketEventContext
  }, [manual.getSocketEventContext])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      return undefined
    }

    let isDisposed = false
    let socket: WebSocket | null = null

    const scheduleReconnect = (): void => {
      if (isDisposed) {
        return
      }
      if (reconnectTimeoutIdRef.current !== null) {
        window.clearTimeout(reconnectTimeoutIdRef.current)
      }
      reconnectTimeoutIdRef.current = window.setTimeout(() => {
        reconnectTimeoutIdRef.current = null
        connect()
      }, 1200)
    }

    const connect = (): void => {
      socket = new WebSocket(getWebSocketUrl('/ws/events'))

      socket.addEventListener('open', () => {
        setIsSocketConnected(true)
        setBackendError(null)
      })

      socket.addEventListener('message', (event) => {
        const context = socketEventContextGetterRef.current?.()
        try {
          const parsed = RuntimeSocketEventSchema.safeParse(JSON.parse(event.data as string))
          if (!parsed.success) {
            return
          }
          const payload = parsed.data
          switch (payload.type) {
            case 'snapshot':
              context?.applyTerminalSnapshot?.(payload.data.terminals)
              break
            case 'terminal_created':
              context?.upsertTerminalSession?.(payload.data.terminal)
              break
            case 'terminal_status':
              context?.updateTerminalStatus?.(payload.data)
              break
            case 'terminal_line':
              context?.appendTerminalLine?.(
                payload.data.terminal_session_id,
                payload.data.line,
              )
              break
            case 'terminal_deleted':
              context?.removeTerminalSession?.(payload.data.terminal_session_id)
              break
            case 'terminal_queue_changed':
              context?.replaceTerminalQueue?.(
                payload.data.terminal_session_id,
                payload.data.queue,
                payload.data.current_command_index,
              )
              break
            case 'terminal_command_status':
              context?.updateTerminalCommand?.(
                payload.data.terminal_session_id,
                payload.data.command,
                payload.data.current_command_index,
              )
              break
            case 'sequence_created':
            case 'sequence_status':
              break
          }
        } catch (error) {
          setBackendError(error instanceof Error ? error.message : 'Failed to parse runtime event')
        }
      })

      socket.addEventListener('error', () => {
        setIsSocketConnected(false)
      })

      socket.addEventListener('close', () => {
        setIsSocketConnected(false)
        scheduleReconnect()
      })
    }

    connect()

    return () => {
      isDisposed = true
      setIsSocketConnected(false)
      if (reconnectTimeoutIdRef.current !== null) {
        window.clearTimeout(reconnectTimeoutIdRef.current)
      }
      reconnectTimeoutIdRef.current = null
      socket?.close()
    }
  }, [setBackendError])

  return {
    manual,
    isSocketConnected,
    requestedMinimizedTerminalWindowIds,
    setRequestedMinimizedTerminalWindowIds,
  }
}
