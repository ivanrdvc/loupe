import { expect, type Page, test } from '@playwright/test'

async function createEvaluator(page: Page): Promise<string> {
  const name = `e2e eval ${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  await page.goto('/evals')
  await page.locator('header').getByRole('button', { name: 'Set up evaluator' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  await dialog.getByRole('textbox', { name: 'Judge prompt' }).fill('Score correctness from 0 to 1.')
  await dialog.getByRole('button', { name: 'Create evaluator' }).click()
  await expect(page.getByRole('link', { name })).toBeVisible()
  return name
}

test('creates an evaluator and shows it in the evaluators list', async ({ page }) => {
  await createEvaluator(page)
})

test('opens the evaluator detail page with an empty runs section', async ({ page }) => {
  const name = await createEvaluator(page)

  await page.getByRole('link', { name }).click()

  await expect(page).toHaveURL(/\/evals\/\d+/)
  await expect(page.getByRole('heading', { name: 'Runs' })).toBeVisible()
  await expect(page.getByText('No runs yet', { exact: false })).toBeVisible()
})

test('shows a not-found state for an unknown evaluator id', async ({ page }) => {
  await page.goto('/evals/99999999')

  await expect(page.getByText('Evaluator not found')).toBeVisible()
})

async function createDataset(page: Page): Promise<void> {
  const name = `e2e ds ${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  await page.goto('/datasets')
  await page.getByRole('button', { name: 'New dataset' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/\/datasets\/\d+/)
}

async function addExample(page: Page, text: string): Promise<void> {
  await page.getByRole('button', { name: 'Add example' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('textbox').first().fill(text)
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(text)).toBeVisible()
}

// Grading a dataset run with a named evaluator stamps each score with that
// evaluator's definitionId — so it surfaces in the evaluator's Scores table.
// (No evalRun is created; the Runs table / /evals/runs/$runId stay empty.)
test('grades a dataset run with a named evaluator and the score lands on the evaluator page', async ({ page }) => {
  const evalName = await createEvaluator(page)
  await createDataset(page)
  await addExample(page, 'Ping?')

  await page.getByRole('tab', { name: /Runs/ }).click()
  await page.getByRole('button', { name: 'Run on all' }).click()
  await expect(page.getByText('fake agent answer')).toBeVisible({ timeout: 20_000 })

  await page.getByRole('combobox', { name: 'Judge' }).click()
  await page.getByRole('option', { name: evalName }).click()
  await page.getByRole('button', { name: 'Judge', exact: true }).click()
  await expect(page.getByText(/Scored \d+ answers/)).toBeVisible({ timeout: 20_000 })

  await page.goto('/evals')
  await page.getByRole('link', { name: evalName }).click()
  await expect(page).toHaveURL(/\/evals\/\d+/)
  await expect(page.getByRole('heading', { name: 'Scores' })).toBeVisible()
  await expect(page.getByText('fixtures judge: pass')).toBeVisible()
})

test('deletes an evaluator and drops it from the list', async ({ page }) => {
  const name = await createEvaluator(page)
  await page.getByRole('link', { name }).click()
  await expect(page).toHaveURL(/\/evals\/\d+/)

  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()

  await expect(page).toHaveURL(/\/evals$/)
  await expect(page.getByRole('link', { name })).toHaveCount(0)
})
