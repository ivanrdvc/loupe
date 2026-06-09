import { expect, test } from '@playwright/test'
import { CHAT, RAW, SINGLE_TRACE } from './fixtures'

test('deep-links into the spans view and hydrates the span tree', async ({ page }) => {
  await page.goto(`/sessions/${CHAT.sessionId}?view=spans&span=${CHAT.chatSpanId}`)

  // Breadcrumb resolves the loader data: title, not the raw id.
  await expect(page.getByLabel('breadcrumb').getByRole('link', { name: 'Sessions' })).toBeVisible()
  await expect(page.getByText(CHAT.title, { exact: true })).toBeVisible()
  await expect(page.getByText(CHAT.toolName, { exact: false }).first()).toBeVisible()
})

test('shows the single-trace badge when the id is a trace id', async ({ page }) => {
  await page.goto(`/sessions/${SINGLE_TRACE.sessionId}`)

  await expect(page.getByText('single trace')).toBeVisible()
})

test('shows a not-found state for an unknown session id', async ({ page }) => {
  await page.goto('/sessions/does-not-exist-xyz')

  await expect(page.getByText('Session not found')).toBeVisible()
})

test('conversation view reconstructs the messages from the spans', async ({ page }) => {
  await page.goto(`/sessions/${CHAT.sessionId}`) // defaults to ?view=conversation

  await expect(page.getByRole('tab', { name: 'Conversation' })).toBeVisible()
  await expect(page.getByText(CHAT.userMessage)).toBeVisible()
  await expect(page.getByText(CHAT.assistantSnippet, { exact: false })).toBeVisible()
})

test('spans-view inspector panel exposes its tabs and raw attributes', async ({ page }) => {
  await page.goto(`/sessions/${CHAT.sessionId}?view=spans&span=${CHAT.chatSpanId}`)

  const panel = page.getByRole('tablist', { name: 'Session inspector panel' })
  await expect(panel.getByRole('tab', { name: 'Details' })).toBeVisible()
  await expect(panel.getByRole('tab', { name: 'Turns' })).toBeVisible()

  await panel.getByRole('tab', { name: 'Attributes' }).click()
  await expect(page.getByText(CHAT.rawAttrKey)).toBeVisible()
})

test('per-row raw toggle reveals infra spans and toggles back off', async ({ page }) => {
  await page.goto(`/sessions/${RAW.sessionId}?view=spans`)

  const rootRow = page.locator(`[data-span-id="${RAW.rootSpanId}"]`)
  await expect(rootRow).toBeVisible()
  await expect(page.getByText(RAW.hiddenSpanText)).toHaveCount(0)

  await rootRow.hover()
  await page.getByRole('button', { name: 'Show raw spans for this trace' }).click()
  await expect(page.getByText(RAW.hiddenSpanText)).toBeVisible()

  // Toggling off from the same per-row control must actually hide it again.
  await rootRow.hover()
  await page.getByRole('button', { name: 'Hide raw spans for this trace' }).click()
  await expect(page.getByText(RAW.hiddenSpanText)).toHaveCount(0)
})

test('a long root name truncates and never pushes the raw toggle past the panel edge', async ({ page }) => {
  await page.goto(`/sessions/${RAW.sessionId}?view=spans`)

  const rootRow = page.locator(`[data-span-id="${RAW.rootSpanId}"]`)
  await rootRow.hover()
  const toggle = page.getByRole('button', { name: 'Show raw spans for this trace' })
  const viewport = page.locator('[data-slot="scroll-area-viewport"]').first()

  const tb = await toggle.boundingBox()
  const vb = await viewport.boundingBox()
  if (!tb || !vb) throw new Error('expected bounding boxes for toggle and viewport')
  expect(tb.x + tb.width).toBeLessThanOrEqual(vb.x + vb.width + 1)
})
