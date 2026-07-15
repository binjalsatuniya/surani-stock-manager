import type { PermissionMap, Role } from '@surani/shared';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        username: string;
        isPrimary: boolean;
        role: Role;
        permissions: PermissionMap;
      };
    }
  }
}

export {};
