import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useModalA11y } from '../../src/hooks/useModalA11y'

interface ModalHarnessProps {
  isOpen?: boolean
  closeOnEscape?: boolean
  withFocusable?: boolean
  renderDialog?: boolean
  onRequestClose?: () => void
  beforeDialog?: ReactNode
}

function ModalHarness({
  isOpen = true,
  closeOnEscape = true,
  withFocusable = true,
  renderDialog = true,
  onRequestClose = vi.fn(),
  beforeDialog = null,
}: ModalHarnessProps) {
  const dialogRef = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(isOpen)

  useEffect(() => {
    setOpen(isOpen)
  }, [isOpen])

  useModalA11y({
    isOpen: open,
    dialogRef: dialogRef as RefObject<HTMLElement | null>,
    onRequestClose,
    closeOnEscape,
  })

  return (
    <div>
      {beforeDialog}
      {open && renderDialog ? (
        <section ref={dialogRef} role="dialog" tabIndex={-1}>
          {withFocusable ? (
            <>
              <button type="button">first</button>
              <button type="button">last</button>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

describe('useModalA11y', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() {
        return document.body
      },
    })
  })

  afterEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() {
        return null
      },
    })
  })

  it('focuses first focusable element on open', async () => {
    render(<ModalHarness />)
    const first = await screen.findByRole('button', { name: 'first' })
    await waitFor(() => {
      expect(first).toHaveFocus()
    })
  })

  it('focuses dialog itself when there are no focusable elements', async () => {
    render(<ModalHarness withFocusable={false} />)
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(dialog).toHaveFocus()
    })

    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog).toHaveFocus()
  })

  it('calls close handler on Escape when closeOnEscape=true', () => {
    const onRequestClose = vi.fn()
    render(<ModalHarness onRequestClose={onRequestClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onRequestClose).toHaveBeenCalledTimes(1)
  })

  it('does not call close handler on Escape when closeOnEscape=false', () => {
    const onRequestClose = vi.fn()
    render(<ModalHarness onRequestClose={onRequestClose} closeOnEscape={false} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onRequestClose).not.toHaveBeenCalled()
  })

  it('traps tab navigation inside modal for forward and backward tab', async () => {
    render(<ModalHarness />)

    const first = await screen.findByRole('button', { name: 'first' })
    const last = screen.getByRole('button', { name: 'last' })

    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(first).toHaveFocus()

    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
  })

  it('restores previous focus when modal unmounts', async () => {
    function Wrapper() {
      const [open, setOpen] = useState(true)

      return (
        <>
          <button type="button" onClick={() => setOpen((prev) => !prev)}>
            trigger
          </button>
          <ModalHarness isOpen={open} />
        </>
      )
    }

    render(<Wrapper />)
    const trigger = screen.getByRole('button', { name: 'trigger' })
    trigger.focus()
    expect(trigger).toHaveFocus()

    // close modal via wrapper state change
    fireEvent.click(trigger)
    expect(trigger).toHaveFocus()

    // open back to ensure hook still works after cleanup/re-init
    fireEvent.click(trigger)
    expect(await screen.findByRole('button', { name: 'first' })).toBeInTheDocument()
  })

  it('returns early when modal is open but dialog ref is missing', () => {
    const onRequestClose = vi.fn()
    render(
      <ModalHarness
        isOpen
        renderDialog={false}
        onRequestClose={onRequestClose}
      />,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onRequestClose).not.toHaveBeenCalled()
  })

  it('ignores tab trapping when dialog ref becomes null after mount', async () => {
    function DialogUnmountWhileOpen() {
      const [renderDialog, setRenderDialog] = useState(true)

      useEffect(() => {
        setRenderDialog(false)
      }, [])

      return <ModalHarness isOpen renderDialog={renderDialog} withFocusable={false} />
    }

    render(<DialogUnmountWhileOpen />)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.body).toBeInTheDocument()
  })
})
