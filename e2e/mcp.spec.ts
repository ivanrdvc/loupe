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
  await expect(page.getByRole('heading', { name: MCP.weatherTool })).toBeVisible()
})

test('the tools tab groups by server, flags conflicts, and shows schema detail', async ({ page }) => {
  await page.goto('/mcp?tab=tools')
  // `search` is on two servers — flagged as a conflict in the list.
  await expect(page.getByText('conflict').first()).toBeVisible()
  // Selecting a tool shows its input schema in the detail pane.
  await page.getByRole('button', { name: new RegExp(MCP.weatherTool) }).click()
  await expect(page.getByText('Input schema')).toBeVisible()
})

test('the lint tab lists findings with actionable messages', async ({ page }) => {
  await page.goto('/mcp?tab=lint')
  await expect(page.getByText('Naming').first()).toBeVisible()
  await expect(page.getByText(MCP.dupFinding, { exact: false })).toBeVisible()
})
