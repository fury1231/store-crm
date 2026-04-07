import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnauthorizedError, ConflictError } from '../../utils/errors';

// ── Mock Prisma (vi.hoisted so mock is available at hoist time) ──
const mockUser = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
}));

const mockRefreshToken = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}));

const mockStore = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock('../../prismaClient', () => ({
  prisma: { user: mockUser, refreshToken: mockRefreshToken, store: mockStore },
}));

// Import after mock setup
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  verifyAccessToken,
  register,
  login,
  refresh,
  logout,
  getMe,
} from '../auth.service';

// ── Set JWT_SECRET for tests ──
const TEST_JWT_SECRET = 'test-jwt-secret-for-unit-tests';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

afterEach(() => {
  delete process.env.JWT_SECRET;
});

// ── Fixtures ──────────────────────────────────────────
const fakeUser = {
  id: 'usr_abc123',
  email: 'test@example.com',
  passwordHash: '$2b$12$LJ1UO8Jv7rZ3fYdGhOaG2eRxJz8iY2VQ8JZxvL1kM9N0pqRs.example',
  name: 'Test User',
  role: 'STAFF' as const,
  storeId: 'str_abc123',
  createdAt: new Date('2026-01-01'),
};

// ── Password hashing ─────────────────────────────────
describe('hashPassword', () => {
  it('should return a bcrypt hash', async () => {
    const hash = await hashPassword('mypassword');
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt prefix
    expect(hash.length).toBeGreaterThan(50);
  });

  it('should produce different hashes for the same input (salt)', async () => {
    const hash1 = await hashPassword('mypassword');
    const hash2 = await hashPassword('mypassword');
    expect(hash1).not.toBe(hash2);
  });
});

describe('comparePassword', () => {
  it('should return true for matching password', async () => {
    const hash = await hashPassword('correct-password');
    const result = await comparePassword('correct-password', hash);
    expect(result).toBe(true);
  });

  it('should return false for wrong password', async () => {
    const hash = await hashPassword('correct-password');
    const result = await comparePassword('wrong-password', hash);
    expect(result).toBe(false);
  });
});

// ── JWT access token ─────────────────────────────────
describe('generateAccessToken', () => {
  it('should return a JWT string with three parts', () => {
    const token = generateAccessToken({ userId: 'usr_1', role: 'ADMIN' });
    expect(token.split('.')).toHaveLength(3);
  });

  it('should throw if JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET;
    expect(() => generateAccessToken({ userId: 'usr_1', role: 'ADMIN' }))
      .toThrow('JWT_SECRET environment variable is not set');
  });
});

describe('verifyAccessToken', () => {
  it('should decode a valid token', () => {
    const token = generateAccessToken({ userId: 'usr_1', role: 'ADMIN' });
    const payload = verifyAccessToken(token);
    expect(payload.userId).toBe('usr_1');
    expect(payload.role).toBe('ADMIN');
  });

  it('should throw UnauthorizedError for an invalid token', () => {
    expect(() => verifyAccessToken('invalid.token.here'))
      .toThrow(UnauthorizedError);
  });

  it('should throw UnauthorizedError for a tampered token', () => {
    const token = generateAccessToken({ userId: 'usr_1', role: 'ADMIN' });
    const tampered = token.slice(0, -5) + 'xxxxx';
    expect(() => verifyAccessToken(tampered)).toThrow(UnauthorizedError);
  });
});

// ── register ─────────────────────────────────────────
describe('register', () => {
  it('should create a user and return tokens', async () => {
    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockResolvedValue(fakeUser);
    mockRefreshToken.create.mockResolvedValue({});

    const result = await register({
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    });

    expect(mockUser.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
    });
    expect(mockUser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: expect.any(String),
      }),
    });
    expect(result.user.id).toBe(fakeUser.id);
    expect(result.user.email).toBe(fakeUser.email);
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });

  it('should throw ConflictError if email already exists', async () => {
    mockUser.findUnique.mockResolvedValue(fakeUser);

    await expect(
      register({ email: 'test@example.com', password: 'password123', name: 'Dup' }),
    ).rejects.toThrow(ConflictError);

    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it('should hash the password before storing', async () => {
    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockImplementation(async ({ data }) => ({
      ...fakeUser,
      passwordHash: data.passwordHash,
    }));
    mockRefreshToken.create.mockResolvedValue({});

    await register({
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    });

    const createCall = mockUser.create.mock.calls[0][0];
    expect(createCall.data.passwordHash).not.toBe('password123');
    expect(createCall.data.passwordHash).toMatch(/^\$2[aby]\$/);
  });
});

// ── login ────────────────────────────────────────────
describe('login', () => {
  it('should return user and tokens on valid credentials', async () => {
    const hash = await hashPassword('correct-pass');
    mockUser.findUnique.mockResolvedValue({ ...fakeUser, passwordHash: hash });
    mockRefreshToken.create.mockResolvedValue({});

    const result = await login('test@example.com', 'correct-pass');

    expect(result.user.id).toBe(fakeUser.id);
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });

  it('should throw UnauthorizedError for non-existent email', async () => {
    mockUser.findUnique.mockResolvedValue(null);

    await expect(login('nobody@example.com', 'pass'))
      .rejects.toThrow(UnauthorizedError);
  });

  it('should throw UnauthorizedError for wrong password', async () => {
    const hash = await hashPassword('correct-pass');
    mockUser.findUnique.mockResolvedValue({ ...fakeUser, passwordHash: hash });

    await expect(login('test@example.com', 'wrong-pass'))
      .rejects.toThrow(UnauthorizedError);
  });

  it('should not reveal whether email or password was wrong', async () => {
    mockUser.findUnique.mockResolvedValue(null);

    try {
      await login('nobody@example.com', 'pass');
    } catch (err) {
      expect((err as UnauthorizedError).message).toBe('Invalid email or password');
    }
  });
});

// ── refresh ──────────────────────────────────────────
describe('refresh', () => {
  const validRefreshToken = {
    id: 'rt_1',
    token: 'valid-refresh-token-hex',
    userId: fakeUser.id,
    expiresAt: new Date(Date.now() + 86400000), // tomorrow
    revokedAt: null,
    createdAt: new Date(),
  };

  it('should return new tokens and revoke the old one', async () => {
    mockRefreshToken.findUnique.mockResolvedValue(validRefreshToken);
    mockRefreshToken.update.mockResolvedValue({});
    mockUser.findUnique.mockResolvedValue(fakeUser);
    mockRefreshToken.create.mockResolvedValue({});

    const result = await refresh('valid-refresh-token-hex');

    expect(mockRefreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt_1' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });

  it('should throw UnauthorizedError for non-existent token', async () => {
    mockRefreshToken.findUnique.mockResolvedValue(null);

    await expect(refresh('nonexistent'))
      .rejects.toThrow(UnauthorizedError);
  });

  it('should throw UnauthorizedError for already-revoked token', async () => {
    mockRefreshToken.findUnique.mockResolvedValue({
      ...validRefreshToken,
      revokedAt: new Date(),
    });

    await expect(refresh('revoked-token'))
      .rejects.toThrow(UnauthorizedError);
  });

  it('should throw UnauthorizedError for expired token', async () => {
    mockRefreshToken.findUnique.mockResolvedValue({
      ...validRefreshToken,
      expiresAt: new Date(Date.now() - 1000), // expired
    });

    await expect(refresh('expired-token'))
      .rejects.toThrow(UnauthorizedError);
  });
});

// ── logout ───────────────────────────────────────────
describe('logout', () => {
  it('should revoke an active refresh token', async () => {
    mockRefreshToken.findUnique.mockResolvedValue({
      id: 'rt_1',
      token: 'token-to-revoke',
      revokedAt: null,
    });
    mockRefreshToken.update.mockResolvedValue({});

    await logout('token-to-revoke');

    expect(mockRefreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt_1' },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('should silently succeed for non-existent token', async () => {
    mockRefreshToken.findUnique.mockResolvedValue(null);

    await expect(logout('nonexistent')).resolves.toBeUndefined();
    expect(mockRefreshToken.update).not.toHaveBeenCalled();
  });

  it('should silently succeed for already-revoked token', async () => {
    mockRefreshToken.findUnique.mockResolvedValue({
      id: 'rt_1',
      revokedAt: new Date(),
    });

    await expect(logout('already-revoked')).resolves.toBeUndefined();
    expect(mockRefreshToken.update).not.toHaveBeenCalled();
  });
});

// ── getMe ────────────────────────────────────────────
describe('getMe', () => {
  it('should return user profile with store info for STAFF/MANAGER', async () => {
    mockUser.findUnique.mockResolvedValue({
      ...fakeUser,
      store: { id: 'str_abc123', name: 'My Store' },
    });

    const result = await getMe('usr_abc123');

    expect(result.id).toBe('usr_abc123');
    expect(result.email).toBe('test@example.com');
    expect(result.store).toEqual({ id: 'str_abc123', name: 'My Store' });
  });

  it('returns availableStores = [user.store] for STAFF/MANAGER', async () => {
    mockUser.findUnique.mockResolvedValue({
      ...fakeUser,
      store: { id: 'str_abc123', name: 'My Store' },
    });

    const result = await getMe('usr_abc123');

    expect(result.availableStores).toEqual([
      { id: 'str_abc123', name: 'My Store' },
    ]);
    // Non-admin must NOT trigger a global store list query.
    expect(mockStore.findMany).not.toHaveBeenCalled();
  });

  it('returns availableStores = [] for STAFF/MANAGER with no assigned store', async () => {
    mockUser.findUnique.mockResolvedValue({
      ...fakeUser,
      storeId: null,
      store: null,
    });

    const result = await getMe('usr_abc123');

    expect(result.availableStores).toEqual([]);
    expect(mockStore.findMany).not.toHaveBeenCalled();
  });

  it('returns availableStores = ALL non-deleted stores for ADMIN', async () => {
    mockUser.findUnique.mockResolvedValue({
      ...fakeUser,
      role: 'ADMIN',
      storeId: null,
      store: null,
    });
    mockStore.findMany.mockResolvedValue([
      { id: 'str_a', name: 'Store A' },
      { id: 'str_b', name: 'Store B' },
    ]);

    const result = await getMe('usr_abc123');

    expect(result.role).toBe('ADMIN');
    expect(result.availableStores).toEqual([
      { id: 'str_a', name: 'Store A' },
      { id: 'str_b', name: 'Store B' },
    ]);
    // Verify the admin store list query excludes soft-deleted rows.
    expect(mockStore.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('should throw UnauthorizedError if user not found', async () => {
    mockUser.findUnique.mockResolvedValue(null);

    await expect(getMe('nonexistent')).rejects.toThrow(UnauthorizedError);
  });
});
