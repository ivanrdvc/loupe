import { expect, test } from '@playwright/test'
import { CHAT, HOSTS, RAW_TITLE } from './fixtures'

test('lists sessions from the fixtures provider', async ({ page }) => {
  await page.goto('/sessions')

  await expect(page.getByRole('main').getByText(CHAT.title, { exact: true })).toBeVisible()
  // header row + at least the two fixture sessions
  expect(await page.getByRole('row').count()).toBeGreaterThanOrEqual(2)
})

test('filters sessions by host server-side', async ({ page }) => {
  await page.goto('/sessions')
  const main = page.getByRole('main')
  await expect(main.getByText(CHAT.title, { exact: true })).toBeVisible()
  await expect(main.getByText(RAW_TITLE, { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Host' }).click()
  await page.getByRole('option', { name: HOSTS.web }).click()

  await expect(page).toHaveURL(new RegExp(`[?&]host=${HOSTS.web}`))
  // web-1 keeps the chat session; the worker-2 raw session is filtered out.
  await expect(main.getByText(CHAT.title, { exact: true })).toBeVisible()
  await expect(main.getByText(RAW_TITLE, { exact: true })).toHaveCount(0)
})

test('clicking a row opens the session drawer and sets ?session=', async ({ page }) => {
  await page.goto('/sessions')

  await page.getByRole('main').getByText(CHAT.title, { exact: true }).click()

  await expect(page).toHaveURL(new RegExp(`[?&]session=${CHAT.sessionId}`))
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText(CHAT.sessionId)).toBeVisible()
})
