import { test, expect } from '@playwright/test'

test.describe('Graph Editor Core Interaction', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the dashboard
    await page.goto('/')
  })

  test('should render the graph editor canvas', async ({ page }) => {
    // Verify the ReactFlow container is visible
    const reactFlowPane = page.locator('.react-flow__pane')
    await expect(reactFlowPane).toBeVisible()

    // Verify minimap and controls are present
    await expect(page.locator('.react-flow__minimap')).toBeVisible()
    await expect(page.locator('.react-flow__controls')).toBeVisible()
  })

  test('should spawn a command node via context menu and allow input', async ({ page }) => {
    // Right click in the center of the canvas
    const reactFlowPane = page.locator('.react-flow__pane')
    const box = await reactFlowPane.boundingBox()
    if (!box) {
      throw new Error('Canvas bounding box not found')
    }

    const startX = box.x + box.width / 2
    const startY = box.y + box.height / 2

    await page.mouse.click(startX, startY, { button: 'right' })

    // Click "Command" from the add node menu
    const addBtn = page.getByRole('button', { name: '⌘ Command' })
    await expect(addBtn).toBeVisible()
    await addBtn.click()

    // Verify we can interact with its text input
    // The CommandNode component uses an input with placeholder "e.g. apt install {package}"
    const commandInput = page.locator('input[placeholder="e.g. apt install {package}"]')
    await commandInput.waitFor({ state: 'visible' })
    await commandInput.fill('echo "hello world"')
    await expect(commandInput).toHaveValue('echo "hello world"')
  })

  test('should interact with Global Variables widget', async ({ page }) => {
    // Open the widget by clicking on its header
    const widgetHeader = page.locator('button', { hasText: 'Global Variables' })
    await expect(widgetHeader).toBeVisible()
    await widgetHeader.click()

    // Create a new variable
    const addButton = page.locator('button', { hasText: 'Add' })
    await expect(addButton).toBeVisible()

    // Find the inputs and fill data
    const nameInput = page.locator('input[placeholder="Key (e.g. login)"]')
    const valInput = page.locator('input[placeholder="Value"]')

    await expect(nameInput).toBeVisible()
    await nameInput.fill('TEST_VAR')
    await valInput.fill('playwright123')

    await valInput.press('Enter')

    // Assuming the item renders on the screen, verifying it shows the variable key
    await expect(page.locator('text="{TEST_VAR}"')).toBeVisible()
  })

  test('should spawn Variable and Terminal nodes', async ({ page }) => {
    const reactFlowPane = page.locator('.react-flow__pane')
    const box = await reactFlowPane.boundingBox()
    if (!box) throw new Error('Canvas bounding box not found')

    const startX = box.x + box.width / 2
    const startY = box.y + box.height / 2

    // 1. Spawn Variable
    await page.mouse.click(startX - 100, startY, { button: 'right' })
    await page.getByRole('button', { name: 'x Variable' }).click()
    
    // Verify Variable node
    const varInput = page.locator('input[placeholder="Enter value…"]')
    await varInput.waitFor({ state: 'visible' })
    await varInput.fill('my-super-secret')
    await expect(varInput).toHaveValue('my-super-secret')

    // 2. Spawn Terminal
    await page.mouse.click(startX + 100, startY, { button: 'right' })
    await page.getByRole('button', { name: '▶ Terminal' }).click()

    // Verify Terminal node label input
    // The terminal has a label input without a placeholder.
    // Or we can just check the run button.
    const runBtn = page.locator('button', { hasText: '▶ Run Chain' })
    await expect(runBtn).toBeVisible()
  })

  test('should connect two nodes with an edge', async ({ page }) => {
    const reactFlowPane = page.locator('.react-flow__pane')
    const box = await reactFlowPane.boundingBox()
    if (!box) throw new Error('Canvas bounding box not found')

    const startX = box.x + box.width / 2
    const startY = box.y + box.height / 2

    // Spawn Command Node at left
    await page.mouse.click(startX - 200, startY, { button: 'right' })
    await page.getByRole('button', { name: '⌘ Command' }).click()

    // Spawn Terminal Node at right
    await page.mouse.click(startX + 200, startY, { button: 'right' })
    await page.getByRole('button', { name: '▶ Terminal' }).click()

    // Wait for nodes to appear
    await page.waitForSelector('.react-flow__node')

    // Find the source handle on Command Node (right side)
    const sourceHandle = page.locator('.react-flow__node-command .react-flow__handle-right').first()
    
    // Find the target handle on Terminal Node (left side)
    const targetHandle = page.locator('.react-flow__node-terminal .react-flow__handle-left').first()

    // Drag and drop from source to target
    await sourceHandle.dragTo(targetHandle)

    // Verify an edge was created and is attached to the DOM
    const edge = page.locator('.react-flow__edge').first()
    await expect(edge).toBeAttached()
  })
})
