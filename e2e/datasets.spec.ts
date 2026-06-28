import { expect, type Page, test } from '@playwright/test'
import { addExample, createDataset } from './helpers'

// A row click right after a dialog closes can be swallowed by the exit
// animation / loader-invalidation rerender — retry until the edit dialog shows.
async function openExample(page: Page, text: string): Promise<void> {
  await expect(async () => {
    await page.getByText(text).click()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Save' })).toBeVisible({ timeout: 2000 })
  }).toPass()
}

// The run list ticks the latest run by default; tick every unchecked run so the
// compare grid lays them side by side. Each run is a row button holding a
// (pointer-events-none) checkbox indicator — click the row, read the box state.
async function selectRunsForCompare(page: Page): Promise<void> {
  const rows = page.getByRole('button').filter({ has: page.getByRole('checkbox', { name: /^Select run/ }) })
  const count = await rows.count()
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i)
    if ((await row.getByRole('checkbox').getAttribute('data-state')) !== 'checked') await row.click()
  }
}

test('creates a dataset and lands on its empty detail page', async ({ page }) => {
  await createDataset(page)
  await expect(page.getByText('No examples yet')).toBeVisible()
})

test('edits an example and replaces its text', async ({ page }) => {
  await createDataset(page)
  await addExample(page, 'Original question')

  await openExample(page, 'Original question')
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('textbox').first().fill('Edited question')
  await sheet.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Edited question')).toBeVisible()
  await expect(page.getByText('Original question')).toHaveCount(0)
})

test('deletes an example back to the empty state', async ({ page }) => {
  await createDataset(page)
  await addExample(page, 'Disposable question')

  await openExample(page, 'Disposable question')
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
  await sheet.getByRole('radio', { name: 'JSON' }).click()
  await sheet.getByPlaceholder(/criterion/).fill('{ "criterion": "mentions the 30-day window" }')
  await sheet.getByRole('button', { name: 'Save' }).click()

  // Reopen: a JSON-looking expected restores JSON mode with the saved value.
  await openExample(page, 'Refund window question')
  await expect(page.getByRole('dialog').getByPlaceholder(/criterion/)).toHaveValue(/30-day window/)
})

test('captures an example into a new dataset from a span', async ({ page }) => {
  const dsName = `captured ${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  // Fixtures span in the inspector → first-class "Add to dataset" dialog.
  await page.goto('/sessions/e2e-session-chat?view=spans&span=sp-chat')
  await page.getByRole('button', { name: 'Add to dataset' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'New dataset' }).click()
  await dialog.getByPlaceholder('New dataset name…').fill(dsName)
  await dialog.getByRole('button', { name: /Save row/ }).click()

  await expect(page.getByText(/Added to dataset|Row updated/)).toBeVisible()

  // The captured example carries the span's own question into the dataset.
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
  // The span carried a system prompt that replay drops → warning callout.
  await expect(dialog.getByRole('alert')).toContainText(/system prompt that is being dropped/i)
  // Expected is prefilled from the span's actual output — no extra step needed.
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
  // Both the span's question and the golden expected (its output) landed.
  await expect(page.getByText('What is the weather in Tokyo?')).toBeVisible()
  await expect(page.getByText('18°C', { exact: false })).toBeVisible()
})

test('runs the dataset against the fake agent and renders the output', async ({ page }) => {
  await createDataset(page)
  await addExample(page, 'Ping?')

  await page.getByRole('tab', { name: /Runs/ }).click()
  await page.getByRole('button', { name: 'Run this dataset' }).click()
  await page.getByRole('button', { name: 'Run on all' }).click()

  await expect(page.getByText('fake agent answer')).toBeVisible({ timeout: 20_000 })
})

test('compares two runs of the same dataset side by side', async ({ page }) => {
  await createDataset(page)
  await addExample(page, 'Ping?')

  await page.getByRole('tab', { name: /Runs/ }).click()
  await page.getByRole('button', { name: 'Run this dataset' }).click()
  await page.getByRole('button', { name: 'Run on all' }).click()
  await expect(page.getByText('fake agent answer')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'New run' }).click()
  await page.getByRole('button', { name: 'Run on all' }).click()
  await expect(page.getByRole('tab', { name: /Runs\s*2/ })).toBeVisible({ timeout: 20_000 })

  // Latest run is ticked by default; tick the older one too → compare grid.
  await selectRunsForCompare(page)

  await expect(page.getByText('fake agent answer')).toHaveCount(2)
})

test('surfaces a regression when an example breaks between two compared runs', async ({ page }) => {
  await createDataset(page)
  await addExample(page, 'Ping?')

  await page.getByRole('tab', { name: /Runs/ }).click()
  // Run 1 succeeds against the fake agent.
  await page.getByRole('button', { name: 'Run this dataset' }).click()
  await page.getByRole('button', { name: 'Run on all' }).click()
  await expect(page.getByText('fake agent answer')).toBeVisible({ timeout: 20_000 })

  // Run 2 points at a dead endpoint → the example errors (ok→error = regression).
  await page.getByRole('button', { name: 'New run' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByPlaceholder(/responses/).fill('http://127.0.0.1:1/v1/responses')
  await sheet.getByRole('button', { name: 'Run on all' }).click()
  await expect(page.getByRole('tab', { name: /Runs\s*2/ })).toBeVisible({ timeout: 20_000 })

  // Compare the two runs side by side.
  await selectRunsForCompare(page)

  // The compare summary counts the ok→error flip as one regression, and the row
  // carries a regressed delta badge (uppercased via CSS, so DOM text is lowercase).
  const regressionChip = page.getByRole('button', { name: /1 regression/ })
  await expect(regressionChip).toBeVisible()
  await expect(page.getByText('regressed', { exact: true })).toBeVisible()

  // The "1 regression" chip filters the grid down to just the regressed row,
  // whose current-run column shows the failure.
  await regressionChip.click()
  await expect(page.getByText('Ping?')).toBeVisible()
  await expect(page.getByText('run failed')).toBeVisible()
})

test('sends agent overrides (system prompt + temperature) on a run', async ({ page }) => {
  await createDataset(page)
  await addExample(page, 'Ping?')

  await page.getByRole('tab', { name: /Runs/ }).click()
  await page.getByRole('button', { name: 'Run this dataset' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByPlaceholder("Override the agent's system prompt…").fill('be terse')
  await sheet.getByPlaceholder('default').first().fill('0.7')
  await sheet.getByRole('button', { name: 'Run on all' }).click()

  await expect(page.getByText('sys=be terse')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('temp=0.7')).toBeVisible()
})

test('judges a run with the fixtures judge and shows a pass rate', async ({ page }) => {
  await createDataset(page)
  await addExample(page, 'Ping?')

  await page.getByRole('tab', { name: /Runs/ }).click()
  await page.getByRole('button', { name: 'Run this dataset' }).click()
  await page.getByRole('button', { name: 'Run on all' }).click()
  await expect(page.getByText('fake agent answer')).toBeVisible({ timeout: 20_000 })

  const list = page.getByRole('listitem').filter({ hasText: 'fake agent answer' })
  await page.getByRole('button', { name: 'Judge run', exact: true }).click()
  // Verdict badge renders the verdict (uppercased via CSS, so DOM text is lowercase).
  await expect(list.getByText('pass', { exact: true })).toBeVisible({ timeout: 20_000 })
})

test('separates run status from judge score with independent filter chips', async ({ page }) => {
  await createDataset(page)
  await addExample(page, 'Ping?')

  await page.getByRole('tab', { name: /Runs/ }).click()
  await page.getByRole('button', { name: 'Run this dataset' }).click()
  await page.getByRole('button', { name: 'Run on all' }).click()
  await expect(page.getByText('fake agent answer')).toBeVisible({ timeout: 20_000 })

  // Status (execution) badge shows even before judging; score reads "not judged".
  const list = page.getByRole('listitem').filter({ hasText: 'fake agent answer' })
  await expect(list.getByText('ok', { exact: true })).toBeVisible()
  await expect(list.getByText('not judged')).toBeVisible()

  await page.getByRole('button', { name: 'Judge run', exact: true }).click()
  // Verdict badge renders the verdict (uppercased via CSS, so DOM text is lowercase).
  await expect(list.getByText('pass', { exact: true })).toBeVisible({ timeout: 20_000 })

  // Filter by score=FAIL → the passing row drops out; clear it back.
  await page.getByRole('button', { name: 'FAIL', exact: true }).click()
  await expect(page.getByText('No results match these filters.')).toBeVisible()
  await page.getByRole('button', { name: 'PASS', exact: true }).click()
  await expect(page.getByText('fake agent answer')).toBeVisible()

  // Filter by status=error → no errored rows, list empties out.
  await page.getByRole('button', { name: 'error', exact: true }).click()
  await expect(page.getByText('No results match these filters.')).toBeVisible()
})
