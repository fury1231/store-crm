import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

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

vi.mock('../../prismaClient', () => ({
  prisma: { user: mockUser, refreshToken: mockRefreshToken },
}));

// Import app after mock setup
import { app } from '../../app';

// ── Test JWT secret ──
const TEST_JWT_SECRET = 'test-jwt-secret-for-integration';

// ── Fixtures ──────────────────────────────────────────
const fakeUser = {
  id: 'usr_abc123',
  email: 'test@example.com',
  passwordHash: '', // set in beforeEach
  name: 'Test User',
  role: 'STAFF' as const,
  storeId: 'str_abc123',
  createdAt: new Date('2026-01-01'),
};

let hashedPassword: string;

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  hashedPassword = await bcrypt.hash('validpassword', 4); // low cost for speed in tests
  fakeUser.passwordHash = hashedPassword;
});

afterEach(() => {
  delete process.env.JWT_SECRET;
});

// Helper: generate a valid access token for authenticated requests
function validAccessToken(userId = 'usr_abc123', role = 'STAFF') {
  return jwt.sign({ userId, role }, TEST_JWT_SECRET, { expiresIn: '15m' });
}

// ── POST /api/auth/register ──────────────────────────
describe('POST /api/auth/register', () => {
  it('should register a new user and return 201 with tokens', async () => {
    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockResolvedValue(fakeUser);
    mockRefreshToken.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'password123', name: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe(fakeUser.email);
  });

  it('should return 400 for missing email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ password: 'password123', name: 'User' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'password123', name: 'User' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for short password (< 8 chars)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'short', name: 'User' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for missing name', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 409 if email already exists', async () => {
    mockUser.findUnique.mockResolvedValue(fakeUser);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123', name: 'Dup' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

// ── POST /api/auth/login ─────────────────────────────
describe('POST /api/auth/login', () => {
  it('should login with valid credentials and return tokens', async () => {
    mockUser.findUnique.mockResolvedValue(fakeUser);
    mockRefreshToken.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'validpassword' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(fakeUser.id);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  it('should return 401 for wrong password', async () => {
    mockUser.findUnique.mockResolvedValue(fakeUser);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 for non-existent email without revealing cause', async () => {
    mockUser.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    // Must not reveal whether email or password was wrong
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('should return 400 for missing email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for missing password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

});

// ── POST /api/auth/refresh ───────────────────────────
describe('POST /api/auth/refresh', () => {
  const validStoredToken = {
    id: 'rt_1',
    token: 'valid-refresh-hex',
    userId: fakeUser.id,
    expiresAt: new Date(Date.now() + 86400000),
    revokedAt: null,
    createdAt: new Date(),
  };

  it('should return new tokens for a valid refresh token', async () => {
    mockRefreshToken.findUnique.mockResolvedValue(validStoredToken);
    mockRefreshToken.update.mockResolvedValue({});
    mockUser.findUnique.mockResolvedValue(fakeUser);
    mockRefreshToken.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-refresh-hex' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  it('should return 401 for expired refresh token', async () => {
    mockRefreshToken.findUnique.mockResolvedValue({
      ...validStoredToken,
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'expired-token' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 for revoked refresh token', async () => {
    mockRefreshToken.findUnique.mockResolvedValue({
      ...validStoredToken,
      revokedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'revoked-token' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 400 for missing refreshToken field', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── POST /api/auth/logout ────────────────────────────
describe('POST /api/auth/logout', () => {
  it('should revoke refresh token and return 204', async () => {
    mockRefreshToken.findUnique.mockResolvedValue({
      id: 'rt_1',
      token: 'token-to-revoke',
      revokedAt: null,
    });
    mockRefreshToken.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: 'token-to-revoke' });

    expect(res.status).toBe(204);
  });

  it('should return 204 even for non-existent token (idempotent)', async () => {
    mockRefreshToken.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: 'nonexistent' });

    expect(res.status).toBe(204);
  });

  it('should return 400 for missing refreshToken field', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── GET /api/auth/me ─────────────────────────────────
describe('GET /api/auth/me', () => {
  it('should return current user profile with valid token', async () => {
    // authenticate middleware calls prisma.user.findUnique
    mockUser.findUnique
      .mockResolvedValueOnce({ id: fakeUser.id, email: fakeUser.email, role: fakeUser.role, storeId: fakeUser.storeId })
      // getMe also calls prisma.user.findUnique
      .mockResolvedValueOnce({
        ...fakeUser,
        store: { id: 'str_abc123', name: 'My Store' },
      });

    const token = validAccessToken();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(fakeUser.id);
    expect(res.body.data.email).toBe(fakeUser.email);
    expect(res.body.data.role).toBe(fakeUser.role);
  });

  it('should return 401 without Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 with expired token', async () => {
    const expired = jwt.sign(
      { userId: 'usr_abc123', role: 'STAFF' },
      TEST_JWT_SECRET,
      { expiresIn: '0s' },
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 with malformed Authorization header', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'NotBearer some-token');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 if user no longer exists', async () => {
    mockUser.findUnique.mockResolvedValue(null);

    const token = validAccessToken();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});

// ── Error format consistency ─────────────────────────
describe('Error format consistency', () => {
  it('should return consistent error format on 401', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });

  it('should return consistent error format on 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({});

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });
});
