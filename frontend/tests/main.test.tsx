import { describe, expect, it, vi } from 'vitest'

const renderMock = vi.hoisted(() => vi.fn())
const createRootMock = vi.hoisted(() => vi.fn(() => ({ render: renderMock })))

vi.mock('react-dom/client', () => ({
  createRoot: createRootMock,
}))

vi.mock('../src/App.tsx', () => ({
  default: () => <div>App</div>,
}))

describe('main.tsx', () => {
  it('mounts app to #root with react root renderer', async () => {
    document.body.innerHTML = '<div id="root"></div>'

    await import('../src/main.tsx')

    expect(createRootMock).toHaveBeenCalledWith(document.getElementById('root'))
    expect(renderMock).toHaveBeenCalledTimes(1)
  })
})
