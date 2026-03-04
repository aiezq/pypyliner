import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CommandPackImportModal from '../../src/components/CommandPackImportModal'

const createProps = () => ({
  isOpen: true,
  onClose: vi.fn(),
  onImport: vi.fn(async () => {}),
})

describe('CommandPackImportModal', () => {
  it('validates json content before submit', async () => {
    const props = createProps()
    render(<CommandPackImportModal {...props} />)

    fireEvent.change(
      screen.getByPlaceholderText(
        'Paste JSON pack: {"pack_id":"my_pack","pack_name":"My Pack","commands":[...]}',
      ),
      { target: { value: '{invalid json' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Import pack' }))

    expect(await screen.findByText('Invalid JSON content')).toBeInTheDocument()
    expect(props.onImport).not.toHaveBeenCalled()
  })

  it('submits trimmed payload and closes modal on success', async () => {
    const props = createProps()
    render(<CommandPackImportModal {...props} />)

    fireEvent.change(
      screen.getByPlaceholderText('File name, e.g. ops-pack.json'),
      { target: { value: ' my-pack.json ' } },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        'Paste JSON pack: {"pack_id":"my_pack","pack_name":"My Pack","commands":[...]}',
      ),
      {
        target: {
          value: '{"pack_id":"my_pack","pack_name":"My Pack","commands":[]}',
        },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Import pack' }))

    await waitFor(() => {
      expect(props.onImport).toHaveBeenCalledWith({
        fileName: 'my-pack.json',
        content: '{"pack_id":"my_pack","pack_name":"My Pack","commands":[]}',
      })
    })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('does not render when closed', () => {
    const props = createProps()
    const { queryByRole } = render(
      <CommandPackImportModal {...props} isOpen={false} />,
    )

    expect(queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('imports json content from file input and fills form values', async () => {
    const props = createProps()
    const { container } = render(<CommandPackImportModal {...props} />)

    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).toBeInTheDocument()
    const jsonContent = '{"pack_id":"from_file","pack_name":"File Pack","commands":[]}'
    const jsonFile = {
      name: 'from-file.json',
      text: vi.fn(async () => jsonContent),
    }

    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [jsonFile] } })
    }

    await waitFor(() => {
      expect(screen.getByDisplayValue('from-file.json')).toBeInTheDocument()
      expect(screen.getByDisplayValue(jsonContent)).toBeInTheDocument()
    })
  })

  it('closes on backdrop click but not on dialog click', () => {
    const props = createProps()
    const { container } = render(<CommandPackImportModal {...props} />)

    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog)
    expect(props.onClose).not.toHaveBeenCalled()

    const backdrop = container.querySelector('.modalBackdrop')
    expect(backdrop).toBeInTheDocument()
    if (backdrop) {
      fireEvent.click(backdrop)
    }
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('shows fallback error message when import throws non-Error', async () => {
    const props = createProps()
    props.onImport = vi.fn(async () => {
      throw 'raw import failure'
    })
    render(<CommandPackImportModal {...props} />)

    fireEvent.change(
      screen.getByPlaceholderText(
        'Paste JSON pack: {"pack_id":"my_pack","pack_name":"My Pack","commands":[...]}',
      ),
      {
        target: {
          value: '{"pack_id":"my_pack","pack_name":"My Pack","commands":[]}',
        },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Import pack' }))

    expect(await screen.findByText('Failed to import JSON pack')).toBeInTheDocument()
  })

  it('uses Error.message when import throws Error', async () => {
    const props = createProps()
    props.onImport = vi.fn(async () => {
      throw new Error('Import failed with explicit error')
    })
    render(<CommandPackImportModal {...props} />)

    fireEvent.change(
      screen.getByPlaceholderText(
        'Paste JSON pack: {"pack_id":"my_pack","pack_name":"My Pack","commands":[...]}',
      ),
      {
        target: {
          value: '{"pack_id":"my_pack","pack_name":"My Pack","commands":[]}',
        },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Import pack' }))

    expect(
      await screen.findByText('Import failed with explicit error'),
    ).toBeInTheDocument()
  })

  it('ignores file import when no file selected', async () => {
    const props = createProps()
    const { container } = render(<CommandPackImportModal {...props} />)
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).toBeInTheDocument()

    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [] } })
    }

    await waitFor(() => {
      expect(props.onImport).not.toHaveBeenCalled()
    })
  })
})
