import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { allPermissionsTrue } from '@surani/shared';

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (existing) {
    console.log('Default superadmin already exists — skipping seed.');
    return;
  }

  const passwordHash = await bcrypt.hash('admin', 12);
  await prisma.user.create({
    data: {
      name: 'Super Administrator',
      username: 'admin',
      passwordHash,
      role: 'superadmin',
      permissions: allPermissionsTrue(),
      security: { pinEnabled: false, pinHash: null, biometricEnabled: false, biometricCredentialId: null },
    },
  });
  console.log('Seeded default superadmin: admin / admin — change this password after first login.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
