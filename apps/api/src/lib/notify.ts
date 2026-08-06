import { readFileSync } from 'node:fs';
import type { Prisma, PrismaClient } from '@prisma/client';
import admin from 'firebase-admin';
import { wantsNotification, type NotifyActivityKey } from '@surani/shared';

type DbClient = PrismaClient | Prisma.TransactionClient;

// Firebase is optional: if no service-account credentials are configured, push notifications are
// simply disabled and every send is a no-op (the app keeps working normally). The credentials path
// is read from FIREBASE_SERVICE_ACCOUNT (a JSON file placed on the server, never committed).
let messaging: admin.messaging.Messaging | null = null;
let initTried = false;

function getMessaging(): admin.messaging.Messaging | null {
  if (initTried) return messaging;
  initTried = true;
  const path = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!path) {
    console.warn('[notify] FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled');
    return null;
  }
  try {
    const serviceAccount = JSON.parse(readFileSync(path, 'utf8'));
    const app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    messaging = app.messaging();
  } catch (err) {
    console.error('[notify] failed to init Firebase — push disabled:', err);
    messaging = null;
  }
  return messaging;
}

/**
 * Best-effort push notification for a business activity. Notifies every user who has opted in to
 * `key` (via their notification settings) EXCEPT the actor who performed the action. Never throws —
 * a notification failure must not break the user's actual action (a sale, a payment…).
 */
export async function notifyActivity(
  db: DbClient,
  actor: { id: string | null },
  key: NotifyActivityKey,
  title: string,
  body: string
): Promise<void> {
  try {
    const fcm = getMessaging();
    if (!fcm) return;

    const users = await db.user.findMany({
      where: { id: { not: actor.id ?? undefined } },
      select: { id: true, preferences: true, pushTokens: { select: { token: true } } },
    });

    const tokens = users
      .filter((u) => u.pushTokens.length > 0 && wantsNotification(u.preferences, key))
      .flatMap((u) => u.pushTokens.map((t) => t.token));

    if (tokens.length === 0) return;

    const res = await fcm.sendEachForMulticast({
      tokens,
      notification: { title, body },
      android: { priority: 'high', notification: { channelId: 'default', sound: 'default' } },
      data: { activity: key },
    });

    // Prune tokens the FCM server reports as permanently invalid (uninstalled / expired), so we
    // don't keep sending to dead devices.
    const dead: string[] = [];
    res.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) {
        dead.push(tokens[i]);
      }
    });
    if (dead.length) {
      await db.pushToken.deleteMany({ where: { token: { in: dead } } }).catch(() => {});
    }
  } catch (err) {
    console.error('[notify] failed to send activity push:', key, err);
  }
}
