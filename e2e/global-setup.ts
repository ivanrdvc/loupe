import { chromium, type FullConfig } from '@playwright/test'
import { OWNER, STORAGE_STATE } from './auth'

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL as string
  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL })
  // /login's loader seeds the owner via bootstrapOwner before the form renders.
  await page.goto('/login')
  await page.getByLabel('Email').fill(OWNER.email)
  await page.getByLabel('Password').fill(OWNER.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
  await page.context().storageState({ path: STORAGE_STATE })
  await browser.close()
}
