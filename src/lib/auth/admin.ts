import { createServerFn } from '@tanstack/react-start'
import { asc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { user as userTable } from '#/db/schema'
import { ROLES, type Role } from './contract'
import { requireCan } from './guards'

export const listUsers = createServerFn({ method: 'GET' }).handler(async () => {
  await requireCan('read', 'admin')
  return db
    .select({ id: userTable.id, name: userTable.name, email: userTable.email, role: userTable.role })
    .from(userTable)
    .orderBy(asc(userTable.email))
})

export const setUserRole = createServerFn({ method: 'POST' })
  .inputValidator((data: { userId: string; role: Role }) => {
    if (!ROLES.includes(data.role)) throw new Error(`Invalid role: ${data.role}`)
    if (!data.userId) throw new Error('userId is required')
    return data
  })
  .handler(async ({ data }) => {
    await requireCan('write', 'admin')
    if (data.role !== 'owner') {
      const [target] = await db.select({ role: userTable.role }).from(userTable).where(eq(userTable.id, data.userId))
      if (target?.role === 'owner') {
        const owners = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.role, 'owner'))
        if (owners.length <= 1) throw new Error('Cannot demote the last owner')
      }
    }
    const updated = await db
      .update(userTable)
      .set({ role: data.role })
      .where(eq(userTable.id, data.userId))
      .returning({ id: userTable.id })
    if (updated.length === 0) throw new Error('User not found')
    return { ok: true }
  })
