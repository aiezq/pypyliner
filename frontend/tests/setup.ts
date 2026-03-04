import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

const ensureLocalStoragePolyfill = (): void => {
  // Always use deterministic in-memory storage for tests.
  // Reading window.localStorage getter in some Node/Vitest environments
  // emits noisy warnings about --localstorage-file.
  const storage = new Map<string, string>()
  const polyfill: Storage = {
    get length() {
      return storage.size
    },
    clear() {
      storage.clear()
    },
    getItem(key: string) {
      return storage.has(key) ? storage.get(key)! : null
    },
    key(index: number) {
      return Array.from(storage.keys())[index] ?? null
    },
    removeItem(key: string) {
      storage.delete(key)
    },
    setItem(key: string, value: string) {
      storage.set(key, value)
    },
  }

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: polyfill,
  })
}

ensureLocalStoragePolyfill()

afterEach(() => {
  cleanup()
})
