import { useEffect, useRef, type RefObject } from 'react'

interface UseModalA11yOptions {
  isOpen: boolean
  dialogRef: RefObject<HTMLElement | null>
  onRequestClose: () => void
  closeOnEscape?: boolean
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

const getFocusableElements = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-hidden') !== 'true' &&
      (element.offsetParent !== null || element === document.activeElement),
  )

export const useModalA11y = ({
  isOpen,
  dialogRef,
  onRequestClose,
  closeOnEscape = true,
}: UseModalA11yOptions): void => {
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      const focusableElements = getFocusableElements(dialog)
      const target = focusableElements[0] ?? dialog
      target.focus()
    })

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (closeOnEscape) {
          event.preventDefault()
          onRequestClose()
        }
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const currentDialog = dialogRef.current
      if (!currentDialog) {
        return
      }

      const focusableElements = getFocusableElements(currentDialog)
      if (focusableElements.length === 0) {
        event.preventDefault()
        currentDialog.focus()
        return
      }

      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const isInsideDialog = active ? currentDialog.contains(active) : false

      if (event.shiftKey) {
        if (!isInsideDialog || active === first) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (!isInsideDialog || active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      window.cancelAnimationFrame(frameId)
      document.removeEventListener('keydown', onKeyDown)
      const previousActiveElement = previousActiveElementRef.current
      if (previousActiveElement?.isConnected) {
        previousActiveElement.focus()
      }
    }
  }, [closeOnEscape, dialogRef, isOpen, onRequestClose])
}
