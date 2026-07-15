import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../../db/prisma';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from '../../lib/tokens';
import { toUserDTO } from '../../lib/serialize';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { UnauthorizedError } from '../../middleware/errorHandler';
import { env } from '../../config/env';

export const authRouter = Router();

const REFRESH_COOKIE = 'refreshToken';

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  // In production the web app and API are usually on different domains (e.g. hosted on Render),
  // so the refresh cookie must be SameSite=None (with Secure) to be sent cross-site. Locally we
  // keep the stricter 'strict' setting.
  sameSite: (env.NODE_ENV === 'production' ? 'none' : 'strict') as 'none' | 'strict',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};

async function issueSession(userId: string, deviceLabel: string | null) {
  const accessToken = signAccessToken(userId);
  const { token: refreshToken, tokenHash, expiresAt } = generateRefreshToken();
  await prisma.refreshToken.create({
    data: { userId, tokenHash, expiresAt, deviceLabel },
  });
  return { accessToken, refreshToken };
}

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true });
const pinLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true });

const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) throw new UnauthorizedError('Invalid username or password');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedError('Invalid username or password');

    const { accessToken, refreshToken } = await issueSession(
      user.id,
      req.headers['user-agent']?.slice(0, 200) ?? null
    );
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
    res.json({ accessToken, refreshToken, user: toUserDTO(user) });
  })
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const incoming: string | undefined = req.body?.refreshToken || req.cookies?.[REFRESH_COOKIE];
    if (!incoming) throw new UnauthorizedError('Missing refresh token');

    const tokenHash = hashRefreshToken(incoming);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.expiresAt < new Date()) throw new UnauthorizedError('Refresh token expired');

    if (stored.revokedAt) {
      // Reuse of an already-rotated token — possible theft. Revoke the whole family (all tokens for this user).
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedError('Refresh token reuse detected — please log in again');
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) throw new UnauthorizedError('User no longer exists');

    const { accessToken, refreshToken } = await issueSession(user.id, stored.deviceLabel);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
    res.json({ accessToken, refreshToken, user: toUserDTO(user) });
  })
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const incoming: string | undefined = req.body?.refreshToken || req.cookies?.[REFRESH_COOKIE];
    if (incoming) {
      const tokenHash = hashRefreshToken(incoming);
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.clearCookie(REFRESH_COOKIE);
    res.status(204).end();
  })
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new UnauthorizedError('User no longer exists');
    res.json(toUserDTO(user));
  })
);

const pinLoginSchema = z.object({ userId: z.string().uuid(), pin: z.string().min(4).max(6) });

authRouter.post(
  '/quick-unlock/pin',
  pinLimiter,
  asyncHandler(async (req, res) => {
    const { userId, pin } = pinLoginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const security = (user?.security as { pinEnabled?: boolean; pinHash?: string } | null) ?? {};
    if (!user || !security.pinEnabled || !security.pinHash) {
      throw new UnauthorizedError('PIN login not enabled for this user');
    }
    const ok = await bcrypt.compare(pin, security.pinHash);
    if (!ok) throw new UnauthorizedError('Incorrect PIN');

    const { accessToken, refreshToken } = await issueSession(
      user.id,
      req.headers['user-agent']?.slice(0, 200) ?? null
    );
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
    res.json({ accessToken, refreshToken, user: toUserDTO(user) });
  })
);
