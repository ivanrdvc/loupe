import { expect, type Page } from '@playwright/test'

// Datasets write to the throwaway e2e.db, shared across parallel workers — each
// test creates its own uniquely-named dataset and asserts only on it.
export async function createDataset(page: Page): Promise<string> {
  const name = `e2e dataset ${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  await page.goto('/datasets')
  await page.getByRole('button', { name: 'New dataset' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/\/datasets\/\d+/)
  return name
}

export async function addExample(page: Page, text: string): Promise<void> {
  await page.getByRole('button', { name: 'Add example' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('textbox').first().fill(text)
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(text)).toBeVisible()
}
