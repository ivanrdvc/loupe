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

test('the tools tab flags unbounded tools and filters by signal', async ({ page }) => {
  await page.goto('/mcp?tab=tools')
  await expect(page.getByText('unbounded').first()).toBeVisible()
  // Filter to the `unbounded` facet — a non-matching tool drops out.
  await page.getByRole('button', { name: 'unbounded', exact: true }).click()
  await expect(page.getByRole('button', { name: new RegExp(MCP.unboundedTool) })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(MCP.weatherTool) })).toHaveCount(0)
})

test('the lint tab surfaces cost findings under a Cost & scale category', async ({ page }) => {
  await page.goto('/mcp?tab=lint')
  await page.getByPlaceholder('Filter by server…').fill(MCP.notesServer)
  await expect(page.getByText(MCP.unboundedFinding, { exact: false })).toBeVisible()
  await expect(page.getByText('Cost & scale').first()).toBeVisible()
})
