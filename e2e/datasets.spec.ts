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

async function addExample(page: Page, text: string): Promise<void> {
  await page.getByRole('button', { name: 'Add example' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('textbox').first().fill(text)
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(text)).toBeVisible()
}

test('creates a dataset and lands on its empty detail page', async ({ page }) => {
  await createDataset(page)
  await expect(page.getByText('No examples yet')).toBeVisible()
})

test('edits an example and replaces its text', async ({ page }) => {
  await createDataset(page)
  await addExample(page, 'Original question')

  await page.getByText('Original question').click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('textbox').first().fill('Edited question')
  await sheet.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Edited question')).toBeVisible()
  await expect(page.getByText('Original question')).toHaveCount(0)
})

test('deletes an example back to the empty state', async ({ page }) => {
  await createDataset(page)
  await addExample(page, 'Disposable question')

  await page.getByText('Disposable question').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete example' }).click()

  await expect(page.getByText('No examples yet')).toBeVisible()
})

test('adds an example via the sheet and shows it in the table', async ({ page }) => {
  await createDataset(page)

  await page.getByRole('button', { name: 'Add example' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('textbox').first().fill('What is the capital of France?')
  await sheet.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('What is the capital of France?')).toBeVisible()
})

test('the created dataset appears on the list page', async ({ page }) => {
  const name = await createDataset(page)

  await page.goto('/datasets')

  await expect(page.getByRole('link', { name }).or(page.getByText(name))).toBeVisible()
})

test('accepts a multi-turn JSON transcript as the example input', async ({ page }) => {
  await createDataset(page)

  await page.getByRole('button', { name: 'Add example' }).click()
  const sheet = page.getByRole('dialog')
  const transcript = JSON.stringify([
    { role: 'user', content: 'Book me a flight' },
    { role: 'assistant', content: 'Where to?' },
  ])
  await sheet.getByRole('textbox').first().fill(transcript)
  // InputEditor validates the ChatMessage[] and reports the turn count.
  await expect(sheet.getByText(/valid · 2 turns/)).toBeVisible()
  await sheet.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Book me a flight')).toBeVisible()
})

test('saves a JSON expected criterion via the Expected JSON toggle', async ({ page }) => {
  await createDataset(page)

  await page.getByRole('button', { name: 'Add example' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('textbox').first().fill('Refund window question')
  await sheet.getByRole('button', { name: 'JSON' }).click()
  await sheet.getByPlaceholder(/criterion/).fill('{ "criterion": "mentions the 30-day window" }')
  await sheet.getByRole('button', { name: 'Save' }).click()

  // Reopen: a JSON-looking expected restores JSON mode with the saved value.
  await page.getByText('Refund window question').click()
  await expect(page.getByRole('dialog').getByPlaceholder(/criterion/)).toHaveValue(/30-day window/)
})

test('captures an example into a new dataset from a span review sheet', async ({ page }) => {
  const dsName = `captured ${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  // Fixtures span in the inspector → Review sheet → Add to dataset popover.
  await page.goto('/sessions/e2e-session-chat?view=spans&span=sp-chat')
  await page.getByRole('button', { name: 'Review' }).click()

  const review = page.getByRole('dialog')
  await review.getByRole('button', { name: 'Add to dataset' }).click()
  await page.getByPlaceholder('Find or create dataset…').fill(dsName)
  await page.getByText(`Create “${dsName}”`).click()

  await expect(page.getByText(/Created .* and added items|Added \d+ item/)).toBeVisible()

  // The captured example carries the span's own question into the dataset.
  await page.goto('/datasets')
  await page.getByText(dsName).click()
  await expect(page).toHaveURL(/\/datasets\/\d+/)
  await expect(page.getByText('What is the weather in Tokyo?')).toBeVisible()
})

test('captures a golden (question + expected) from a span into a dataset', async ({ page }) => {
  const dsName = `golden ${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  await page.goto('/sessions/e2e-session-chat?view=spans&span=sp-chat')
  await page.getByRole('button', { name: 'Review' }).click()

  const review = page.getByRole('dialog')
  await review.getByRole('button', { name: 'Use as expected' }).click()
  await review.getByRole('button', { name: 'Add to dataset' }).click()
  await page.getByPlaceholder('Find or create dataset…').fill(dsName)
  await page.getByText(`Create “${dsName}”`).click()
  await expect(page.getByText(/Created .* and added items|Added \d+ item/)).toBeVisible()

  await page.goto('/datasets')
  await page.getByText(dsName).click()
  await expect(page).toHaveURL(/\/datasets\/\d+/)
  // Both the span's question and the golden expected (its output) landed.
  await expect(page.getByText('What is the weather in Tokyo?')).toBeVisible()
  await expect(page.getByText('18°C', { exact: false })).toBeVisible()
})

test('runs the dataset against the fake agent and renders the output', async ({ page }) => {
  await createDataset(page)
  await addExample(page, 'Ping?')

  await page.getByRole('tab', { name: /Runs/ }).click()
  await page.getByRole('button', { name: 'Run on all' }).click()

  await expect(page.getByText('fake agent answer')).toBeVisible({ timeout: 20_000 })
})

test('compares two runs of the same dataset side by side', async ({ page }) => {
  await createDataset(page)
  await addExample(page, 'Ping?')

  await page.getByRole('tab', { name: /Runs/ }).click()
  const runAll = page.getByRole('button', { name: 'Run on all' })
  await runAll.click()
  await expect(page.getByText('fake agent answer')).toBeVisible({ timeout: 20_000 })
  await runAll.click()
  await expect(page.getByRole('tab', { name: /Runs\s*2/ })).toBeVisible({ timeout: 20_000 })

  // Pick a second run in the compare selector → the grid lays both runs side by side.
  await page.getByRole('combobox').filter({ hasText: 'No compare' }).click()
  await page.getByRole('option').filter({ hasText: /^vs / }).click()

  await expect(page.getByText('fake agent answer')).toHaveCount(2)
})

test('sends agent overrides (system prompt + temperature) on a run', async ({ page }) => {
  await createDataset(page)
  await addExample(page, 'Ping?')

  await page.getByRole('tab', { name: /Runs/ }).click()
  await page.getByRole('button', { name: 'Overrides' }).click()
  const drawer = page.getByRole('dialog')
  await drawer.getByPlaceholder("Override the agent's system prompt…").fill('be terse')
  await drawer.getByPlaceholder('default').first().fill('0.7')
  await drawer.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'Run on all' }).click()

  await expect(page.getByText('sys=be terse')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('temp=0.7')).toBeVisible()
})

test('judges a run with the fixtures judge and shows a pass rate', async ({ page }) => {
  await createDataset(page)
  await addExample(page, 'Ping?')

  await page.getByRole('tab', { name: /Runs/ }).click()
  await page.getByRole('button', { name: 'Run on all' }).click()
  await expect(page.getByText('fake agent answer')).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: 'Judge', exact: true }).click()

  await expect(page.getByText('100% pass', { exact: true })).toBeVisible({ timeout: 20_000 })
})
