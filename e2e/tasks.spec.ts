import { expect, test } from '@playwright/test'
import { CHAT, TASK } from './fixtures'

// Fires filtered in the provider query, not client-side — chat never reaches the rollup.
test('tasks page shows fire traces and excludes chat traffic', async ({ page }) => {
  await page.goto('/tasks')

  await expect(page.getByText(TASK.name)).toBeVisible()
  await expect(page.getByText(CHAT.agent)).toHaveCount(0)
})
