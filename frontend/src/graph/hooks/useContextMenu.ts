import { useState, useCallback } from 'react'

export type ContextMenuMode = 'canvas' | 'node' | 'selection' | 'edge'

export interface ContextMenuState {
  isOpen: boolean
  mode: ContextMenuMode
  x: number
  y: number
  /** Canvas coordinates (accounting for pan/zoom) */
  canvasX: number
  canvasY: number
  /** Node ID when mode === 'node' */
  nodeId: string | null
  /** Node IDs when mode === 'selection' */
  selectedNodeIds: string[]
  /** Edge ID when mode === 'edge' */
  edgeId: string | null
}

const INITIAL: ContextMenuState = {
  isOpen: false,
  mode: 'canvas',
  x: 0,
  y: 0,
  canvasX: 0,
  canvasY: 0,
  nodeId: null,
  selectedNodeIds: [],
  edgeId: null,
}

export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState>(INITIAL)

  const openCanvasMenu = useCallback(
    (screen: { x: number; y: number }, canvas: { x: number; y: number }) => {
      setState({
        isOpen: true,
        mode: 'canvas',
        x: screen.x,
        y: screen.y,
        canvasX: canvas.x,
        canvasY: canvas.y,
        nodeId: null,
        selectedNodeIds: [],
        edgeId: null,
      })
    },
    [],
  )

  const openNodeMenu = useCallback(
    (screen: { x: number; y: number }, nodeId: string) => {
      setState({
        isOpen: true,
        mode: 'node',
        x: screen.x,
        y: screen.y,
        canvasX: 0,
        canvasY: 0,
        nodeId,
        selectedNodeIds: [],
        edgeId: null,
      })
    },
    [],
  )

  const openSelectionMenu = useCallback(
    (screen: { x: number; y: number }, selectedNodeIds: string[]) => {
      setState({
        isOpen: true,
        mode: 'selection',
        x: screen.x,
        y: screen.y,
        canvasX: 0,
        canvasY: 0,
        nodeId: null,
        selectedNodeIds,
        edgeId: null,
      })
    },
    [],
  )

  const openEdgeMenu = useCallback(
    (screen: { x: number; y: number }, edgeId: string) => {
      setState({
        isOpen: true,
        mode: 'edge',
        x: screen.x,
        y: screen.y,
        canvasX: 0,
        canvasY: 0,
        nodeId: null,
        selectedNodeIds: [],
        edgeId,
      })
    },
    [],
  )

  const close = useCallback(() => {
    setState(INITIAL)
  }, [])

  return { menu: state, openCanvasMenu, openNodeMenu, openSelectionMenu, openEdgeMenu, closeMenu: close }
}
