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

test('clicking a server opens its detail page with its tools and schema', async ({ page }) => {
  await page.goto('/mcp')
  await page.getByRole('link', { name: MCP.weatherServer }).click()
  await expect(page).toHaveURL(/\/mcp\/weather/)
  await expect(page.getByRole('heading', { name: MCP.weatherTool })).toBeVisible()
  // The browser auto-selects a tool, so its input schema is shown in the detail pane.
  await expect(page.getByText('Input schema')).toBeVisible()
})

test('the tools table flags a tool exposed by multiple servers as a conflict', async ({ page }) => {
  await page.goto('/mcp?tab=tools')
  // `search` is aggregated into one row exposed by two servers — flagged as a conflict.
  const row = page.getByRole('row', { name: new RegExp(MCP.duplicateTool) }).first()
  await expect(row.getByText('conflict')).toBeVisible()
  await expect(row.getByRole('link', { name: MCP.weatherServer })).toBeVisible()
  await expect(row.getByRole('link', { name: MCP.searchServer })).toBeVisible()
})

test('the lint tab lists findings with actionable messages', async ({ page }) => {
  await page.goto('/mcp?tab=lint')
  await expect(page.getByText('Naming').first()).toBeVisible()
  await expect(page.getByText(MCP.dupFinding, { exact: false })).toBeVisible()
})

test('the tools table flags unbounded tools and filters by the Facets filter', async ({ page }) => {
  await page.goto('/mcp?tab=tools')
  const unbounded = page.getByRole('row', { name: new RegExp(MCP.unboundedTool) })
  await expect(unbounded.getByText('unbounded')).toBeVisible()
  // Filter to the `unbounded` facet — a non-matching tool drops out of the table.
  await page.getByRole('button', { name: 'Facets' }).click()
  await page.getByRole('option', { name: /unbounded/ }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('row', { name: new RegExp(MCP.unboundedTool) })).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(MCP.weatherTool) })).toHaveCount(0)
})

test('the lint tab surfaces cost findings under a Cost & scale category', async ({ page }) => {
  await page.goto('/mcp?tab=lint')
  await page.getByPlaceholder('Filter by server…').fill(MCP.notesServer)
  await expect(page.getByText(MCP.unboundedFinding, { exact: false })).toBeVisible()
  await expect(page.getByText('Cost & scale').first()).toBeVisible()
})
