import { expect, type Page, test } from '@playwright/test'

// System prompts are derived from inventory detection over the fixtures provider
// (FIXTURE_INVENTORY in src/lib/telemetry/fixtures.ts). Detection is fire-and-forget
// on read, so the first visit triggers the scan and a reload surfaces the rows.

async function openSystemPrompts(page: Page) {
  await page.goto('/inventory/system-prompts')
  await expect(async () => {
    await page.reload()
    await expect(page.getByRole('cell', { name: 'WeatherBot' })).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 20_000 })
}

test('lists agent system prompts captured from telemetry', async ({ page }) => {
  await openSystemPrompts(page)
  await expect(page.getByRole('row', { name: /WeatherBot/ })).toContainText('You are a helpful weather assistant')
})

test('opens an agent and shows its system prompt with history', async ({ page }) => {
  await openSystemPrompts(page)
  await page.getByRole('cell', { name: 'WeatherBot' }).click()
  await expect(page.getByText('You are a helpful weather assistant. Be concise.').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
})
