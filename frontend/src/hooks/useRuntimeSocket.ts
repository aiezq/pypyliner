import { useEffect, useState } from 'react'
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

export const useRuntimeSocket = ({
  onEvent,
  onOpen,
  onOpenError,
  onErrorMessage,
}: UseRuntimeSocketOptions) => {
  const [isSocketConnected, setIsSocketConnected] = useState(false)

  useEffect(() => {
    let isDisposed = false
    let reconnectTimerId: number | null = null
    let socket: WebSocket | null = null

    const connectSocket = (): void => {
      socket = new WebSocket(WS_EVENTS_URL)

      socket.onopen = () => {
        if (isDisposed) {
          return
        }
        setIsSocketConnected(true)
        if (!onOpen) {
          return
        }
        void Promise.resolve(onOpen()).catch((error: unknown) => {
          if (isDisposed) {
            return
          }
          onOpenError?.(error)
        })
      }

      socket.onmessage = (message) => {
        if (isDisposed) {
          return
        }
        try {
          const rawPayload = JSON.parse(message.data) as unknown
          const parsedEvent = RuntimeSocketEventSchema.safeParse(rawPayload)
          if (!parsedEvent.success) {
            onErrorMessage?.('Failed to parse WebSocket event payload')
            return
          }
          onEvent(parsedEvent.data)
        } catch {
          onErrorMessage?.('Failed to parse WebSocket event payload')
        }
      }

      socket.onerror = () => {
        if (isDisposed) {
          return
        }
        onErrorMessage?.('WebSocket disconnected from backend')
      }

      socket.onclose = () => {
        if (isDisposed) {
          return
        }
        setIsSocketConnected(false)
        reconnectTimerId = window.setTimeout(connectSocket, 1500)
      }
    }

    connectSocket()

    return () => {
      isDisposed = true
      if (reconnectTimerId !== null) {
        window.clearTimeout(reconnectTimerId)
      }
      socket?.close()
    }
  }, [onErrorMessage, onEvent, onOpen, onOpenError])

  return {
    isSocketConnected,
  }
}
