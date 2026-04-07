import { describe, it, expect } from 'vitest';
import { scopedWhere } from '../storeScope';

describe('scopedWhere', () => {
  it('returns a where with just storeId when no extra filters are provided', () => {
    expect(scopedWhere('str_1')).toEqual({ storeId: 'str_1' });
  });

  it('merges storeId on top of an existing where clause', () => {
    expect(
      scopedWhere('str_1', { deletedAt: null, name: { contains: 'foo' } }),
    ).toEqual({
      deletedAt: null,
      name: { contains: 'foo' },
      storeId: 'str_1',
    });
  });

  it('always overrides any storeId already in the supplied where (no override-from-input)', () => {
    // If a caller mistakenly tried to pass in a different storeId, the
    // helper MUST clobber it. This is the whole point of routing every
    // query through scopedWhere — there is exactly one source of truth
    // for the active store.
    const result = scopedWhere('str_correct', {
      // @ts-expect-error — intentional bad input
      storeId: 'str_HIJACKED',
      deletedAt: null,
    });
    expect(result.storeId).toBe('str_correct');
  });

  it('does not mutate the input object', () => {
    const original = { deletedAt: null };
    const out = scopedWhere('str_1', original);
    expect(original).toEqual({ deletedAt: null });
    expect(out).not.toBe(original);
  });
});
