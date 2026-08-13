import type { NextFunction, Request, Response } from 'express';
import type { PermissionMap, Role } from '@surani/shared';
import { prisma } from '../db/prisma';
import { verifyAccessToken } from '../lib/tokens';
import { effectivePermissionsFor } from '../lib/effectivePermissions';
import { UnauthorizedError } from './errorHandler';
import { asyncHandler } from '../lib/asyncHandler';

/**
 * Verifies the JWT, then re-loads role + permissions fresh from the DB on every request
 * (rather than trusting stale JWT claims) so a permission change takes effect immediately,
 * not just after the access token's 15-minute expiry.
 */
export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedError('Missing access token');

  let userId: string;
  try {
    userId = verifyAccessToken(header.slice('Bearer '.length)).sub;
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError('User no longer exists');

  req.user = {
    id: user.id,
    name: user.name,
    username: user.username,
    isPrimary: user.isPrimary,
    role: user.role as Role,
    // Role permissions plus this person's exceptions — or, for anyone not yet converted to live
    // roles, their existing snapshot unchanged. Everything downstream sees one resolved map, so no
    // permission check had to change.
    permissions: await effectivePermissionsFor(user),
  };
  next();
});
