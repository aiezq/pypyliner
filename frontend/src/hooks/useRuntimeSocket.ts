import { useEffect, useEffectEvent, useState } from 'react'
import { WS_EVENTS_URL } from '../lib/api'
import {
  RuntimeSocketEventSchema,
  type RuntimeSocketEvent,
} from '../lib/schemas'

interface UseRuntimeSocketOptions {
  onEvent: (event: RuntimeSocketEvent) => void
  onOpen?: () => void | Promise<void>
  onOpenError?: (error: unknown) => void
  onErrorMessage?: (message: string) => void
}

const RECONNECT_DELAY_MS = 1500
const DISCONNECT_ERROR_DELAY_MS = 3500

export const useRuntimeSocket = ({
  onEvent,
  onOpen,
  onOpenError,
  onErrorMessage,
}: UseRuntimeSocketOptions) => {
  const [isSocketConnected, setIsSocketConnected] = useState(false)

  const handleOpen = useEffectEvent(async (): Promise<void> => {
    if (!onOpen) {
      return
    }

    try {
      await onOpen()
    } catch (error) {
      onOpenError?.(error)
    }
  })

  const handleMessage = useEffectEvent((rawMessage: string): void => {
    try {
      const rawPayload = JSON.parse(rawMessage) as unknown
      const parsedEvent = RuntimeSocketEventSchema.safeParse(rawPayload)
      if (!parsedEvent.success) {
        onErrorMessage?.('Failed to parse WebSocket event payload')
        return
      }
      onEvent(parsedEvent.data)
    } catch {
      onErrorMessage?.('Failed to parse WebSocket event payload')
    }
  })

  const handleDisconnect = useEffectEvent((): void => {
    onErrorMessage?.('WebSocket disconnected from backend')
  })

  useEffect(() => {
    let isDisposed = false
    let reconnectTimerId: number | null = null
    let disconnectErrorTimerId: number | null = null
    let socket: WebSocket | null = null

    const connectSocket = (): void => {
      socket = new WebSocket(WS_EVENTS_URL)

      socket.onopen = () => {
        if (isDisposed) {
          return
        }
        if (disconnectErrorTimerId !== null) {
          window.clearTimeout(disconnectErrorTimerId)
          disconnectErrorTimerId = null
        }
        setIsSocketConnected(true)
        void handleOpen()
      }

      socket.onmessage = (message) => {
        if (isDisposed) {
          return
        }
        handleMessage(message.data)
      }

      socket.onerror = () => undefined

      socket.onclose = () => {
        if (isDisposed) {
          return
        }
        setIsSocketConnected(false)
        if (disconnectErrorTimerId === null) {
          disconnectErrorTimerId = window.setTimeout(() => {
            disconnectErrorTimerId = null
            handleDisconnect()
          }, DISCONNECT_ERROR_DELAY_MS)
        }
        reconnectTimerId = window.setTimeout(() => {
          reconnectTimerId = null
          connectSocket()
        }, RECONNECT_DELAY_MS)
      }
    }

    connectSocket()

    return () => {
      isDisposed = true
      if (reconnectTimerId !== null) {
        window.clearTimeout(reconnectTimerId)
      }
      if (disconnectErrorTimerId !== null) {
        window.clearTimeout(disconnectErrorTimerId)
      }
      socket?.close()
    }
  }, [])

  return {
    isSocketConnected,
  }
}
