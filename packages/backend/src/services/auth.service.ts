import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../prismaClient';
import { RegisterInput } from '../validators/auth.validator';
import { UnauthorizedError, ConflictError } from '../utils/errors';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}

/** Hash a plaintext password with bcrypt. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Compare a plaintext password against a bcrypt hash. */
export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Sign a short-lived JWT access token containing userId and role. */
export function generateAccessToken(payload: {
  userId: string;
  role: string;
}): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRY });
}

/** Verify and decode a JWT access token. */
export function verifyAccessToken(token: string): { userId: string; role: string } {
  try {
    return jwt.verify(token, getJwtSecret()) as { userId: string; role: string };
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

/** Generate an opaque refresh token and persist it in the database. */
export async function generateRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: { token, userId, expiresAt },
  });

  return token;
}

/** Register a new user account. */
export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
    },
  });

  const accessToken = generateAccessToken({ userId: user.id, role: user.role });
  const refreshToken = await generateRefreshToken(user.id);

  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    accessToken,
    refreshToken,
  };
}

/** Authenticate a user with email + password, returning tokens. */
export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const accessToken = generateAccessToken({ userId: user.id, role: user.role });
  const refreshToken = await generateRefreshToken(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      storeId: user.storeId,
    },
    accessToken,
    refreshToken,
  };
}

/** Exchange a valid refresh token for a new access token + refresh token (rotation). */
export async function refresh(token: string) {
  const stored = await prisma.refreshToken.findUnique({ where: { token } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  // Revoke the used token (single-use)
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  const accessToken = generateAccessToken({ userId: user.id, role: user.role });
  const refreshToken = await generateRefreshToken(user.id);

  return { accessToken, refreshToken };
}

/** Revoke a refresh token (logout). */
export async function logout(token: string): Promise<void> {
  const stored = await prisma.refreshToken.findUnique({ where: { token } });

  // Silently succeed even if token not found (idempotent logout)
  if (!stored || stored.revokedAt) {
    return;
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });
}

/** Get the current user's profile by ID. */
export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      store: { select: { id: true, name: true } },
    },
  });

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    storeId: user.storeId,
    store: user.store,
  };
}
