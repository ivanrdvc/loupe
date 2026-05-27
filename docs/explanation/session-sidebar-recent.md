---
title: Session Sidebar Recent
type: explanation
summary: How the Sessions page and sidebar Recent list differ.
status: current
owner: loupe
audience: engineers
last-reviewed: 2026-05-15
tags: [sessions, sidebar, telemetry]
---

# Session Sidebar Recent

The `/sessions` page intentionally shows all sessions from the active telemetry
provider. It is the operator view for cross-user debugging and should not be
scoped to the current app user.

The app shell sidebar's `Recent` section is different: it is a personal
shortcut list. It calls `currentUserSessionsQuery(7, userId)`, where `userId`
comes from the current operator's identity and is applied server-side before
returning up to five sessions.

For now, identity is just a single user ID stored in browser `localStorage`
(key `loupe:user-id`). Set it from the UI:

1. Open Settings → Account.
2. Enter your **User ID** — the same value emitted in telemetry as `user.id`,
   `enduser.id`, or `ag_ui.user.id`.
3. Save. The sidebar's Recent list refreshes immediately.

The `useUserId()` hook in `src/hooks/use-user.ts` reads/writes the value and
notifies subscribers; the sidebar passes the ID into the query, and the server
fn forwards it to the telemetry provider as a `userId` filter.

If no User ID is set, the query is disabled and the sidebar hides the entire
`Recent` section, including the heading. This empty state does not affect the
Sessions page.

Direct session detail routes (`/sessions/$sessionId`) remain unfiltered for the
same reason as the list page: they are part of the shared operator surface.

This localStorage setting is a placeholder. A real auth-backed identity will
eventually replace it.
