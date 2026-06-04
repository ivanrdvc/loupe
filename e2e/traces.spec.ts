import { expect, test } from '@playwright/test'
import { CHAT, SINGLE_TRACE } from './fixtures'

test('traces tab lists traces from the provider', async ({ page }) => {
  await page.goto('/traces')

  await expect(page.getByRole('tab', { name: 'Traces' })).toBeVisible()
  await expect(page.getByText(CHAT.agent)).toBeVisible()
})

test('clicking a trace row opens the trace drawer and sets ?trace=', async ({ page }) => {
  await page.goto('/traces')

  await page.getByText(CHAT.agent).click()

  await expect(page).toHaveURL(new RegExp(`[?&]trace=${CHAT.traceId}`))
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('spans tab lazy-lists sub-agent spans', async ({ page }) => {
  await page.goto('/traces?tab=spans')

  await expect(page.getByRole('tab', { name: 'Spans' })).toBeVisible()
  await expect(page.getByText(SINGLE_TRACE.agent, { exact: true })).toBeVisible()
})
