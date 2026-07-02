import { describe, expect, it } from 'vitest'
import type { Role, User } from './contract'
import { can } from './policy'

const as = (roles: Role[]): User => ({ id: 'u', email: 'u@x.dev', name: 'u', roles })

describe('can', () => {
  it('owner has full read/write including admin', () => {
    expect(can(as(['owner']), 'write', 'admin')).toBe(true)
    expect(can(as(['owner']), 'write', 'datasets')).toBe(true)
  })

  it('editor writes curation resources but not admin or agents', () => {
    expect(can(as(['editor']), 'write', 'datasets')).toBe(true)
    expect(can(as(['editor']), 'write', 'scores')).toBe(true)
    expect(can(as(['editor']), 'read', 'admin')).toBe(false)
    expect(can(as(['editor']), 'write', 'agents')).toBe(false)
  })

  it('viewer reads only', () => {
    expect(can(as(['viewer']), 'read', 'traces' as never)).toBe(false)
    expect(can(as(['viewer']), 'read', 'datasets')).toBe(true)
    expect(can(as(['viewer']), 'write', 'notes')).toBe(false)
  })

  it('no roles denies everything', () => {
    expect(can(as([]), 'read', 'datasets')).toBe(false)
  })

  it('multiple roles union their grants', () => {
    expect(can(as(['viewer', 'editor']), 'write', 'datasets')).toBe(true)
  })
})
