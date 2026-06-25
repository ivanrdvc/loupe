import { expect, test } from '@playwright/test'
import { CHAT, TASK } from './fixtures'

// Fires filtered in the provider query, not client-side — chat never reaches the rollup.
test('tasks page shows fire traces and excludes chat traffic', async ({ page }) => {
  await page.goto('/tasks')

  await expect(page.getByText(TASK.name)).toBeVisible()
  await expect(page.getByText(CHAT.agent)).toHaveCount(0)
})

// The summary tiles were reframed around span/transport health: "Error-free
// fires", "Healthy tasks", "Avg duration" — replacing the old "Success rate" /
// "Errored fires" framing that overclaimed visibility into logical failures.
test('tasks page shows the health-framed summary tiles', async ({ page }) => {
  await page.goto('/tasks')

  await expect(page.getByText('Error-free fires')).toBeVisible()
  await expect(page.getByText('Healthy tasks')).toBeVisible()
  await expect(page.getByText('Avg duration')).toBeVisible()

  await expect(page.getByText('Success rate')).toHaveCount(0)
  await expect(page.getByText('Errored fires')).toHaveCount(0)
})
