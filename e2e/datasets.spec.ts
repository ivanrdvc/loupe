import { expect, type Page, test } from '@playwright/test'

// Datasets write to the throwaway e2e.db, shared across parallel workers — each
// test creates its own uniquely-named dataset and asserts only on it.
async function createDataset(page: Page): Promise<string> {
  const name = `e2e dataset ${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  await page.goto('/datasets')
  await page.getByRole('button', { name: 'New dataset' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/\/datasets\/\d+/)
  return name
}

// "Add question" on the empty state, "Example" once questions exist — click whichever shows.
async function addQuestion(page: Page, text: string): Promise<void> {
  await page
    .getByRole('button', { name: 'Add question' })
    .or(page.getByRole('button', { name: 'Example', exact: true }))
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').first().fill(text)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(text)).toBeVisible()
}

// A row expands inline on click; the detail carries the Edit / Delete actions.
async function expandRow(page: Page, text: string): Promise<void> {
  await page.getByText(text).click()
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible()
}

test('creates a dataset and lands on its empty detail page', async ({ page }) => {
  await createDataset(page)
  await expect(page.getByText('No questions yet')).toBeVisible()
})

test('adds a question and shows it in the table', async ({ page }) => {
  await createDataset(page)
  await addQuestion(page, 'What is the capital of France?')
  await expect(page.getByText('What is the capital of France?')).toBeVisible()
})

test('edits a question and replaces its text', async ({ page }) => {
  await createDataset(page)
  await addQuestion(page, 'Original question')

  await expandRow(page, 'Original question')
  await page.getByRole('button', { name: 'Edit' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').first().fill('Edited question')
  await dialog.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Edited question')).toBeVisible()
  await expect(page.getByText('Original question')).toHaveCount(0)
})

test('deletes a question back to the empty state', async ({ page }) => {
  await createDataset(page)
  await addQuestion(page, 'Disposable question')

  await expandRow(page, 'Disposable question')
  await page.getByRole('button', { name: 'Delete' }).click()

  await expect(page.getByText('No questions yet')).toBeVisible()
})

test('accepts a multi-turn JSON transcript as the question input', async ({ page }) => {
  await createDataset(page)

  await page.getByRole('button', { name: 'Add question' }).click()
  const dialog = page.getByRole('dialog')
  const transcript = JSON.stringify([
    { role: 'user', content: 'Book me a flight' },
    { role: 'assistant', content: 'Where to?' },
  ])
  await dialog.getByRole('textbox').first().fill(transcript)
  await expect(dialog.getByText(/valid · 2 turns/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Book me a flight')).toBeVisible()
})

test('saves a JSON expected criterion via the Expected JSON toggle', async ({ page }) => {
  await createDataset(page)

  await page.getByRole('button', { name: 'Add question' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').first().fill('Refund window question')
  await dialog.getByRole('radio', { name: 'JSON' }).click()
  await dialog.getByPlaceholder(/criterion/).fill('{ "criterion": "mentions the 30-day window" }')
  await dialog.getByRole('button', { name: 'Save' }).click()

  // Reopen via the inline detail: a JSON-looking expected restores JSON mode.
  await expandRow(page, 'Refund window question')
  await page.getByRole('button', { name: 'Edit' }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByPlaceholder(/criterion/)).toHaveValue(/30-day window/)
})

test('captures a question into a new dataset from a span', async ({ page }) => {
  const dsName = `captured ${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  await page.goto('/sessions/e2e-session-chat?view=spans&span=sp-chat')
  await page.getByRole('button', { name: 'Add to dataset' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'New dataset' }).click()
  await dialog.getByPlaceholder('New dataset name…').fill(dsName)
  await dialog.getByRole('button', { name: /Save row/ }).click()

  await expect(page.getByText(/Added to dataset|Row updated/)).toBeVisible()

  await page.goto('/datasets')
  await expect(async () => {
    await page.getByText(dsName).click()
    await expect(page).toHaveURL(/\/datasets\/\d+/, { timeout: 2000 })
  }).toPass()
  await expect(page.getByText('What is the weather in Tokyo?')).toBeVisible()
})

test('captures a golden (question + expected) from a span into a dataset', async ({ page }) => {
  const dsName = `golden ${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  await page.goto('/sessions/e2e-session-chat?view=spans&span=sp-chat')
  await page.getByRole('button', { name: 'Add to dataset' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('alert')).toContainText(/system prompt that is being dropped/i)
  await expect(dialog.getByPlaceholder('What it should have been.')).toHaveValue(/18°C/)
  await dialog.getByRole('button', { name: 'New dataset' }).click()
  await dialog.getByPlaceholder('New dataset name…').fill(dsName)
  await dialog.getByRole('button', { name: /Save row/ }).click()
  await expect(page.getByText(/Added to dataset|Row updated/)).toBeVisible()

  await page.goto('/datasets')
  await expect(async () => {
    await page.getByText(dsName).click()
    await expect(page).toHaveURL(/\/datasets\/\d+/, { timeout: 2000 })
  }).toPass()
  await expect(page.getByText('What is the weather in Tokyo?')).toBeVisible()
  await expect(page.getByText('18°C', { exact: false })).toBeVisible()
})

test('runs the whole dataset and shows the answer inline', async ({ page }) => {
  await createDataset(page)
  await addQuestion(page, 'Ping?')

  await page.getByRole('button', { name: 'Run all' }).click()
  await expect(page.getByText('fake agent answer')).toBeVisible({ timeout: 20_000 })
})

test('runs a single question from its row', async ({ page }) => {
  await createDataset(page)
  await addQuestion(page, 'Ping?')

  await page.getByRole('button', { name: 'Run this question' }).click()
  await expect(page.getByText('fake agent answer')).toBeVisible({ timeout: 20_000 })
})

test('expands a row to reveal the full answer and actions', async ({ page }) => {
  await createDataset(page)
  await addQuestion(page, 'Ping?')
  await page.getByRole('button', { name: 'Run all' }).click()
  await expect(page.getByText('fake agent answer')).toBeVisible({ timeout: 20_000 })

  await page.getByText('Ping?').click()
  // The inline detail shows the answer body plus Edit / Delete actions.
  await expect(page.getByText('fake agent answer')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible()
})

test('surfaces an earlier run under the Previous answers disclosure', async ({ page }) => {
  await createDataset(page)
  await addQuestion(page, 'Ping?')

  await page.getByRole('button', { name: 'Run all' }).click()
  await expect(page.getByText('fake agent answer')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Run all' }).click()

  // Expand the row; once the second run lands the disclosure shows one prior answer.
  await page.getByText('Ping?').click()
  await expect(page.getByRole('button', { name: 'Previous answers 1' })).toBeVisible({ timeout: 20_000 })
})

test('sends agent overrides (system prompt + temperature) from settings', async ({ page }) => {
  await createDataset(page)
  await addQuestion(page, 'Ping?')

  await page.getByRole('button', { name: 'Run settings' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: /Config/ }).click()
  await sheet.getByPlaceholder("Override the agent's system prompt…").fill('be terse')
  await sheet.getByPlaceholder('default').first().fill('0.7')
  await sheet.getByRole('button', { name: 'Run all' }).click()

  await expect(page.getByText('sys=be terse')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('temp=0.7')).toBeVisible()
})

test('auto-scores answers when an evaluator is chosen in settings', async ({ page }) => {
  await createDataset(page)
  await addQuestion(page, 'Ping?')

  await page.getByRole('button', { name: 'Run settings' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: /Score/ }).click()
  await sheet.getByRole('combobox', { name: 'Score' }).click()
  await page.getByRole('option', { name: 'Default correctness' }).click()
  await sheet.getByRole('button', { name: 'Run all' }).click()

  await expect(page.getByText('fake agent answer')).toBeVisible({ timeout: 20_000 })
  // Auto-judge stamps a score chip (name+verdict, no space in the DOM) and the header pass rate.
  await expect(page.getByText(/correctness\s*pass/)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/last run \d+% pass/)).toBeVisible()
})

test('shows a run failure inline when the endpoint is dead', async ({ page }) => {
  await createDataset(page)
  await addQuestion(page, 'Ping?')

  await page.getByRole('button', { name: 'Run settings' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByPlaceholder(/responses/).fill('http://127.0.0.1:1/v1/responses')
  await sheet.getByRole('button', { name: 'Run all' }).click()

  await expect(page.getByText('run failed')).toBeVisible({ timeout: 20_000 })
})
