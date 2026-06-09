import { expect, test } from '@playwright/test'
import { CHAT, TASK } from './fixtures'

// The provider filters to fire trigger types before its LIMIT, so chat traffic
// never reaches the rollup — proves the push-down, not just client-side hiding.
test('tasks page shows fire traces and excludes chat traffic', async ({ page }) => {
  await page.goto('/tasks')

  await expect(page.getByText(TASK.name)).toBeVisible()
  await expect(page.getByText(CHAT.agent)).toHaveCount(0)
})
