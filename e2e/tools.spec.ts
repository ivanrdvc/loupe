import { expect, test } from '@playwright/test'

// Tool data is served by the fixtures provider (src/lib/telemetry/fixtures.ts):
// run_sql @ 12.0% errors, get_weather @ 7.5%, search_docs clean. These exercise
// the unified tool surfaces — home widgets, catalog, drilldown drawer, and the
// inspector health hint — all keyed off the same aggregate.

test('home error widget lists a high-error-rate tool with its rate', async ({ page }) => {
  await page.goto('/')
  const errorCard = page.locator('[data-slot="card"]', { hasText: 'Tools with high error rate' })
  await expect(errorCard).toBeVisible()
  const row = errorCard.getByRole('link', { name: /run_sql/ })
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
  await page
    .getByRole('link', { name: /run_sql/ })
    .first()
    .click()

  const drawer = page.getByRole('dialog', { name: 'run_sql' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('Calls', { exact: true })).toBeVisible()
  await expect(drawer.getByText('100', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('heading', { name: 'Recent calls' })).toBeVisible()
})

test('the tools catalog lists every tool with its error rate', async ({ page }) => {
  await page.goto('/tools')
  await expect(page.getByRole('cell', { name: 'run_sql' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'get_weather' })).toBeVisible()
  await expect(page.getByText('12.0%')).toBeVisible()
})

test('clicking a catalog row opens the tool profile drawer', async ({ page }) => {
  await page.goto('/tools')
  await page.getByRole('cell', { name: 'run_sql' }).click()
  await expect(page.getByRole('dialog', { name: 'run_sql' })).toBeVisible()
})

test('the inspector tools tab flags a tool with a high recent error rate', async ({ page }) => {
  await page.goto('/sessions/e2e-session-chat?view=spans')
  await page.getByRole('tab', { name: 'Tools' }).click()

  // The get_weather definition is advertised by the chat span; the health hint
  // badge comes from the shared catalog aggregate (7.5% err ≥ the 5% threshold).
  await expect(page.getByText('7.5% err')).toBeVisible()
})

// Token honesty: maxTokens is a real measured value, the rest are chars÷4
// estimates. The catalog must render Max with no ≈ and the estimates with one.
test('the catalog renders Max tokens without an ≈ and estimates with one', async ({ page }) => {
  await page.goto('/tools')
  const row = page.getByRole('row', { name: /run_sql/ })
  await expect(row).toBeVisible()
  // maxTokens=600 is real → exact "600 tok", no estimate marker.
  await expect(row.getByRole('cell', { name: '600 tok', exact: true })).toBeVisible()
  await expect(row).not.toContainText('≈600')
  // p95TokensEst=400 is an estimate → "≈400 tok".
  await expect(row.getByRole('cell', { name: '≈400 tok', exact: true })).toBeVisible()
})

test('the tool drawer marks the max-result tile real and the p95 tile estimated', async ({ page }) => {
  await page.goto('/tools')
  await page.getByRole('cell', { name: 'run_sql' }).click()
  const drawer = page.getByRole('dialog', { name: 'run_sql' })
  await expect(drawer).toBeVisible()

  // maxTokens=600 tokenized exactly → no ≈; p95TokensEst=400 estimated → ≈.
  const maxTile = drawer.getByText('max result', { exact: true }).locator('..')
  await expect(maxTile).toContainText('600 tok')
  await expect(maxTile).not.toContainText('≈')

  const p95Tile = drawer.getByText('p95 result', { exact: true }).locator('..')
  await expect(p95Tile).toContainText('≈400 tok')

  // Recent-calls Size column shows real result tokens, not chars.
  await expect(drawer.getByRole('cell', { name: '130 tok', exact: true })).toBeVisible()
})

// Regression for the key-collision sort bug: recent-call rows are keyed by
// spanId, so toggling a sort header reorders the (2) fixture rows without
// dropping or duplicating any.
test('the tool drawer keeps a stable row count while re-sorting recent calls', async ({ page }) => {
  await page.goto('/tools')
  await page.getByRole('cell', { name: 'run_sql' }).click()
  const drawer = page.getByRole('dialog', { name: 'run_sql' })
  await expect(drawer).toBeVisible()

  const rows = drawer.locator('tbody tr')
  await expect(rows).toHaveCount(2)
  const firstSize = () => rows.first().locator('td').nth(3).innerText()

  // Two toggles of the same header flip desc→asc, reversing the two rows.
  await drawer.getByRole('button', { name: 'Size' }).click()
  await expect(rows).toHaveCount(2)
  const before = await firstSize()

  await drawer.getByRole('button', { name: 'Size' }).click()
  await expect(rows).toHaveCount(2)
  const after = await firstSize()

  expect(before).not.toBe(after)

  // Duration sort must also keep both rows.
  await drawer.getByRole('button', { name: 'Duration' }).click()
  await expect(rows).toHaveCount(2)
})
