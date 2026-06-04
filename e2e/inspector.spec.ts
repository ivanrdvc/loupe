import { expect, test } from '@playwright/test'
import { CHAT, SINGLE_TRACE } from './fixtures'

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
