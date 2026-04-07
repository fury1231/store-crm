import { describe, it, expect } from 'vitest';
import { Prisma, Role, InteractionType } from './generated/prisma/client';
import type {
  Store,
  User,
  Customer,
  Tag,
  Product,
  Interaction,
  Sale,
  SaleItem,
  InteractionProduct,
  RefreshToken,
} from './generated/prisma/client';

// ── Enum validation ─────────────────────────────

describe('Role enum', () => {
  it('should have exactly ADMIN, MANAGER, STAFF values', () => {
    expect(Object.values(Role)).toEqual(['ADMIN', 'MANAGER', 'STAFF']);
  });

  it('should allow ADMIN', () => {
    const role: Role = Role.ADMIN;
    expect(role).toBe('ADMIN');
  });

  it('should allow MANAGER', () => {
    const role: Role = Role.MANAGER;
    expect(role).toBe('MANAGER');
  });

  it('should allow STAFF', () => {
    const role: Role = Role.STAFF;
    expect(role).toBe('STAFF');
  });
});

describe('InteractionType enum', () => {
  it('should have exactly VISIT, CALL, PURCHASE, COMPLAINT values', () => {
    expect(Object.values(InteractionType)).toEqual([
      'VISIT',
      'CALL',
      'PURCHASE',
      'COMPLAINT',
    ]);
  });

  it('should allow VISIT', () => {
    expect(InteractionType.VISIT).toBe('VISIT');
  });

  it('should allow CALL', () => {
    expect(InteractionType.CALL).toBe('CALL');
  });

  it('should allow PURCHASE', () => {
    expect(InteractionType.PURCHASE).toBe('PURCHASE');
  });

  it('should allow COMPLAINT', () => {
    expect(InteractionType.COMPLAINT).toBe('COMPLAINT');
  });
});

// ── Model existence (via Prisma.ModelName) ──────

describe('Schema models', () => {
  const expectedModels = [
    'Store',
    'User',
    'Customer',
    'Tag',
    'Product',
    'Interaction',
    'Sale',
    'SaleItem',
    'InteractionProduct',
    'RefreshToken',
  ];

  it('should define all required models', () => {
    const models = Object.values(Prisma.ModelName);
    for (const name of expectedModels) {
      expect(models).toContain(name);
    }
  });

  it('should have exactly the expected models (no extras)', () => {
    expect(Object.values(Prisma.ModelName).sort()).toEqual(
      [...expectedModels].sort(),
    );
  });
});

// ── Field validation via ScalarFieldEnum ────────

function fieldsOf(enumObj: Record<string, string>): string[] {
  return Object.values(enumObj);
}

describe('Store fields', () => {
  const fields = fieldsOf(Prisma.StoreScalarFieldEnum);

  it('should have id, name, address, phone, createdAt, updatedAt, deletedAt', () => {
    expect(fields).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'address',
        'phone',
        'createdAt',
        'updatedAt',
        'deletedAt',
      ]),
    );
  });

  it('should have exactly 7 scalar fields', () => {
    expect(fields).toHaveLength(7);
  });
});

describe('User fields', () => {
  const fields = fieldsOf(Prisma.UserScalarFieldEnum);

  it('should have id, email, passwordHash, name, role, storeId, createdAt', () => {
    expect(fields).toEqual(
      expect.arrayContaining([
        'id',
        'email',
        'passwordHash',
        'name',
        'role',
        'storeId',
        'createdAt',
      ]),
    );
  });

  it('should have exactly 7 scalar fields', () => {
    expect(fields).toHaveLength(7);
  });
});

describe('Customer fields', () => {
  const fields = fieldsOf(Prisma.CustomerScalarFieldEnum);

  it('should have id, name, phone, email, address, notes, storeId, createdAt, updatedAt, deletedAt', () => {
    expect(fields).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'phone',
        'email',
        'address',
        'notes',
        'storeId',
        'createdAt',
        'updatedAt',
        'deletedAt',
      ]),
    );
  });

  it('should have exactly 10 scalar fields', () => {
    expect(fields).toHaveLength(10);
  });
});

describe('Tag fields', () => {
  const fields = fieldsOf(Prisma.TagScalarFieldEnum);

  it('should have id, name, color, storeId', () => {
    expect(fields).toEqual(
      expect.arrayContaining(['id', 'name', 'color', 'storeId']),
    );
  });

  it('should have exactly 4 scalar fields', () => {
    expect(fields).toHaveLength(4);
  });
});

describe('Product fields', () => {
  const fields = fieldsOf(Prisma.ProductScalarFieldEnum);

  it('should have id, name, price, sku, category, storeId, createdAt', () => {
    expect(fields).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'price',
        'sku',
        'category',
        'storeId',
        'createdAt',
      ]),
    );
  });

  it('should have exactly 7 scalar fields', () => {
    expect(fields).toHaveLength(7);
  });
});

describe('Interaction fields', () => {
  const fields = fieldsOf(Prisma.InteractionScalarFieldEnum);

  it('should have id, type, date, notes, customerId, userId, storeId, createdAt', () => {
    expect(fields).toEqual(
      expect.arrayContaining([
        'id',
        'type',
        'date',
        'notes',
        'customerId',
        'userId',
        'storeId',
        'createdAt',
      ]),
    );
  });

  it('should have exactly 8 scalar fields', () => {
    expect(fields).toHaveLength(8);
  });
});

describe('Sale fields', () => {
  const fields = fieldsOf(Prisma.SaleScalarFieldEnum);

  it('should have id, totalAmount, date, customerId, userId, storeId, createdAt', () => {
    expect(fields).toEqual(
      expect.arrayContaining([
        'id',
        'totalAmount',
        'date',
        'customerId',
        'userId',
        'storeId',
        'createdAt',
      ]),
    );
  });

  it('should have exactly 7 scalar fields', () => {
    expect(fields).toHaveLength(7);
  });
});

describe('SaleItem fields', () => {
  const fields = fieldsOf(Prisma.SaleItemScalarFieldEnum);

  it('should have id, saleId, productId, quantity, unitPrice', () => {
    expect(fields).toEqual(
      expect.arrayContaining([
        'id',
        'saleId',
        'productId',
        'quantity',
        'unitPrice',
      ]),
    );
  });

  it('should have exactly 5 scalar fields', () => {
    expect(fields).toHaveLength(5);
  });
});

describe('InteractionProduct fields', () => {
  const fields = fieldsOf(Prisma.InteractionProductScalarFieldEnum);

  it('should have interactionId and productId', () => {
    expect(fields).toEqual(
      expect.arrayContaining(['interactionId', 'productId']),
    );
  });

  it('should have exactly 2 fields (composite key, no standalone id)', () => {
    expect(fields).toHaveLength(2);
    expect(fields).not.toContain('id');
  });
});

describe('RefreshToken fields', () => {
  const fields = fieldsOf(Prisma.RefreshTokenScalarFieldEnum);

  it('should have id, token, userId, expiresAt, revokedAt, createdAt', () => {
    expect(fields).toEqual(
      expect.arrayContaining([
        'id',
        'token',
        'userId',
        'expiresAt',
        'revokedAt',
        'createdAt',
      ]),
    );
  });

  it('should have exactly 6 scalar fields', () => {
    expect(fields).toHaveLength(6);
  });
});

// ── Type-level sanity checks ────────────────────
// These verify the TypeScript types are generated correctly.
// If the types were wrong, the file would fail to compile.

describe('Generated TypeScript types', () => {
  it('Store type has expected shape', () => {
    const mock: Store = {
      id: 'test',
      name: 'Test Store',
      address: null,
      phone: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(mock.id).toBe('test');
  });

  it('User type allows nullable storeId', () => {
    const mock: User = {
      id: 'test',
      email: 'a@b.com',
      passwordHash: 'hash',
      name: 'Test',
      role: Role.ADMIN,
      storeId: null,
      createdAt: new Date(),
    };
    expect(mock.storeId).toBeNull();
  });

  it('User type allows storeId with value', () => {
    const mock: User = {
      id: 'test',
      email: 'a@b.com',
      passwordHash: 'hash',
      name: 'Test',
      role: Role.STAFF,
      storeId: 'store-123',
      createdAt: new Date(),
    };
    expect(mock.storeId).toBe('store-123');
  });

  it('SaleItem type uses Prisma.Decimal for unitPrice', () => {
    const mock: SaleItem = {
      id: 'test',
      saleId: 'sale-1',
      productId: 'prod-1',
      quantity: 2,
      unitPrice: new Prisma.Decimal('19.99'),
    };
    expect(mock.unitPrice.toString()).toBe('19.99');
  });

  it('InteractionProduct type has no id field', () => {
    const mock: InteractionProduct = {
      interactionId: 'int-1',
      productId: 'prod-1',
    };
    expect(mock).not.toHaveProperty('id');
  });

  it('RefreshToken type has expected shape with nullable revokedAt', () => {
    const mock: RefreshToken = {
      id: 'rt_1',
      token: 'opaque-hex-string',
      userId: 'usr_1',
      expiresAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
    };
    expect(mock.revokedAt).toBeNull();
  });
});
