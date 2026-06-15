import { expect, test } from '@playwright/test'
import { MCP } from './fixtures'

// MCP servers/tools come from e2e/fake-agent.mjs via MCP_REGISTRY_REFS_JSON —
// a real env-source registry fetch + lint, exercised end to end.

test('the servers tab lists every registered server', async ({ page }) => {
  await page.goto('/mcp')
  await expect(page.getByRole('link', { name: MCP.weatherServer })).toBeVisible()
  await expect(page.getByRole('link', { name: MCP.searchServer })).toBeVisible()
  await expect(page.getByRole('link', { name: MCP.notesServer })).toBeVisible()
})

test('clicking a server opens its detail page with its tools', async ({ page }) => {
  await page.goto('/mcp')
  await page.getByRole('link', { name: MCP.weatherServer }).click()
  await expect(page).toHaveURL(/\/mcp\/weather/)
  await expect(page.getByText(MCP.weatherTool, { exact: true })).toBeVisible()
})

test('the tools tab dedupes names and shows detail for the selected tool', async ({ page }) => {
  await page.goto('/mcp?tab=tools')
  // `search` is exposed by two servers but listed once.
  const item = page.getByText(MCP.duplicateTool, { exact: true })
  await expect(item).toHaveCount(1)
  await item.click()
  // Detail pane names both providers.
  await expect(page.getByText('Provided by')).toBeVisible()
  await expect(page.getByRole('link', { name: MCP.weatherServer })).toBeVisible()
  await expect(page.getByRole('link', { name: MCP.searchServer })).toBeVisible()
})

test('the lint tab groups findings with actionable messages', async ({ page }) => {
  await page.goto('/mcp?tab=lint')
  await expect(page.getByRole('heading', { name: /Naming/ })).toBeVisible()
  await expect(page.getByText(MCP.dupFinding, { exact: false })).toBeVisible()
})
