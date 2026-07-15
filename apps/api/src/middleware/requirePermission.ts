import type { NextFunction, Request, Response } from 'express';
import { hasPermission, type PermissionKey } from '@surani/shared';
import { ForbiddenError, UnauthorizedError } from './errorHandler';

/** Server-side equivalent of the legacy client's can(perm) — now unbypassable via direct API calls. */
export function requirePermission(perm: PermissionKey) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();
    if (!hasPermission(req.user.role, req.user.permissions, perm)) {
      throw new ForbiddenError(`Missing permission: ${perm}`);
    }
    next();
  };
}
