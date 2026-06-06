import { expect, test } from '@playwright/test'

// Tool data is served by the fixtures provider (src/lib/telemetry/fixtures.ts):
// run_sql @ 12.0% errors, get_weather @ 7.5%, search_docs clean. These exercise
// the unified tool surfaces — home widgets, catalog, drilldown drawer, and the
// inspector health hint — all keyed off the same aggregate.

test('home error widget lists a high-error-rate tool with its rate', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Tools with high error rate')).toBeVisible()
  const row = page.getByRole('link', { name: /run_sql/ })
  await expect(row).toBeVisible()
  await expect(row).toContainText('12.0%')
})

test('home payload widget lists a heavy tool', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Tools returning too much')).toBeVisible()
  await expect(page.getByRole('link', { name: /get_weather/ }).first()).toBeVisible()
})

test('clicking a tool on the home opens its profile drawer with aggregate stats', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /run_sql/ }).click()

  const drawer = page.getByRole('dialog', { name: 'run_sql' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('Calls', { exact: true })).toBeVisible()
  await expect(drawer.getByText('100', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('heading', { name: 'Recent calls' })).toBeVisible()
})

test('the tools catalog lists every tool with its error rate', async ({ page }) => {
  await page.goto('/tools')
  await expect(page.getByRole('link', { name: 'run_sql' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'get_weather' })).toBeVisible()
  await expect(page.getByText('12.0%')).toBeVisible()
})

test('the inspector tools tab flags a tool with a high recent error rate', async ({ page }) => {
  await page.goto('/sessions/e2e-session-chat?view=spans')
  await page.getByRole('tab', { name: 'Tools' }).click()

  // The get_weather definition is advertised by the chat span; the health hint
  // badge comes from the shared catalog aggregate (7.5% err ≥ the 5% threshold).
  await expect(page.getByText('7.5% err')).toBeVisible()
})
