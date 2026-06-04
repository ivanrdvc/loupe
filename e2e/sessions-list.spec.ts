import { expect, test } from '@playwright/test'
import { CHAT } from './fixtures'

test('lists sessions from the fixtures provider', async ({ page }) => {
  await page.goto('/sessions')

  await expect(page.getByText(CHAT.title, { exact: true })).toBeVisible()
  // header row + at least the two fixture sessions
  expect(await page.getByRole('row').count()).toBeGreaterThanOrEqual(2)
})

test('clicking a row opens the session drawer and sets ?session=', async ({ page }) => {
  await page.goto('/sessions')

  await page.getByText(CHAT.title, { exact: true }).click()

  await expect(page).toHaveURL(new RegExp(`[?&]session=${CHAT.sessionId}`))
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText(CHAT.sessionId)).toBeVisible()
})
