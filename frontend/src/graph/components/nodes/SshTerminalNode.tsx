import { useMemo, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import BaseNode from './BaseNode'
import { HANDLE_IDS, type SshTerminalNodeData } from '../../types'
import { useGraphStore } from '../../store/graphStore'
import { useGraphExecution } from '../../hooks/useGraphExecution'
import styles from './BaseNode.module.scss'
import { useI18n } from '../../../i18n/I18nProvider'

type Props = NodeProps & { data: SshTerminalNodeData }

export default function SshTerminalNode({ id, data, selected }: Props) {
  const { messages } = useI18n()
  const updateNodeData = useGraphStore((s) => s.updateNodeData)
  const activeTerminalIds = useGraphStore((s) => s.activeTerminalIds)
  const sshConnections = useGraphStore((s) => s.sshConnections)
  const { executeTerminalNode } = useGraphExecution()
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const selectedConnection = useMemo(
    () => sshConnections.find((connection) => connection.id === data.connectionId) ?? null,
    [data.connectionId, sshConnections],
  )

  const hasTerminalId = !!data.terminalId
  const isConnected = hasTerminalId && activeTerminalIds.includes(data.terminalId!)
  const isClosed = hasTerminalId && !activeTerminalIds.includes(data.terminalId!)

  const connectionSummary = selectedConnection
    ? `${selectedConnection.username}@${selectedConnection.host}`
    : data.sshUsername && data.sshHost
      ? `${data.sshUsername}@${data.sshHost}`
      : messages.nodes.sshTargetNotConfigured

  const statusVariant = error ? 'error' : isConnected ? 'connected' : isClosed ? 'closed' : 'idle'
  const statusLabel = error
    ? error
    : isConnected
      ? messages.nodes.sshConnected(connectionSummary)
      : isClosed
        ? messages.nodes.sshClosed
        : connectionSummary

  const updateSshNodeData = (nextData: Partial<SshTerminalNodeData>): void => {
    updateNodeData<SshTerminalNodeData>(id, {
      ...nextData,
      terminalId: null,
    })
  }

  const handleRun = async () => {
    setError(null)
    setIsRunning(true)
    try {
      await executeTerminalNode(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.nodes.executionFailed)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <>
      <Handle
        type="target"
        id={HANDLE_IDS.CHAIN_IN}
        position={Position.Left}
        style={{ top: 20, background: '#8bc7ff', width: 10, height: 10 }}
      />

      <Handle
        type="source"
        id={HANDLE_IDS.SEQUENCE_OUT}
        position={Position.Right}
        style={{ top: '50%', background: '#f3b35e', width: 10, height: 10 }}
      />

      <BaseNode
        icon="⇄"
        iconVariant="sshTerminal"
        label={data.label}
        onLabelSave={(label) => updateNodeData<SshTerminalNodeData>(id, { label })}
        selected={selected}
        footer={
          <div className={styles.nodeStatus}>
            <div className={`${styles.statusDot} ${styles[`statusDot--${statusVariant}`]}`} />
            <span className={styles.statusText}>{statusLabel}</span>
          </div>
        }
      >
        <div className={styles.nodeField}>
          <span className={styles.nodeFieldLabel}>{messages.nodes.sshVariable}</span>
          <select
            className={styles.nodeInput}
            value={data.connectionId ?? ''}
            onChange={(e) =>
              updateSshNodeData({
                connectionId: e.target.value || null,
              })
            }
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="">{messages.nodes.manualCredentials}</option>
            {sshConnections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.username}@{connection.host}
              </option>
            ))}
          </select>
        </div>

        {selectedConnection ? (
          <div className={styles.nodeCodeBlock}>{selectedConnection.username}@{selectedConnection.host}</div>
        ) : (
          <>
            <div className={styles.nodeField}>
              <span className={styles.nodeFieldLabel}>{messages.nodes.username}</span>
              <input
                className={styles.nodeInput}
                value={data.sshUsername}
                onChange={(e) => updateSshNodeData({ sshUsername: e.target.value })}
                onPointerDown={(e) => e.stopPropagation()}
                placeholder={messages.nodes.usernamePlaceholder}
              />
            </div>

            <div className={styles.nodeField}>
              <span className={styles.nodeFieldLabel}>{messages.nodes.host}</span>
              <input
                className={styles.nodeInput}
                value={data.sshHost}
                onChange={(e) => updateSshNodeData({ sshHost: e.target.value })}
                onPointerDown={(e) => e.stopPropagation()}
                placeholder={messages.nodes.hostPlaceholder}
              />
            </div>

            <div className={styles.nodeField}>
              <span className={styles.nodeFieldLabel}>{messages.nodes.password}</span>
              <div className={styles.nodeInputRow}>
                <input
                  className={styles.nodeInput}
                  type={showPassword ? 'text' : 'password'}
                  value={data.sshPassword}
                  onChange={(e) => updateSshNodeData({ sshPassword: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                  placeholder={messages.nodes.password}
                />
                <button
                  type="button"
                  className={styles.nodeInputToggle}
                  onClick={() => setShowPassword((value) => !value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label={showPassword ? messages.nodes.hideSshPassword : messages.nodes.showSshPassword}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>
          </>
        )}

        {sshConnections.length === 0 ? (
          <div className={styles.nodeHint}>{messages.nodes.noSavedSshVariables}</div>
        ) : null}

        <button
          type="button"
          className={styles.runButton}
          disabled={isRunning}
          onClick={handleRun}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {isRunning ? `⏳ ${messages.nodes.connecting}` : `⇄ ${messages.nodes.runViaSsh}`}
        </button>
      </BaseNode>
    </>
  )
}
