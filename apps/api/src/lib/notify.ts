import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import admin from 'firebase-admin';
import { wantsNotification, type NotifyActivityKey } from '@surani/shared';

type DbClient = PrismaClient | Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// In-memory feed of recent notifiable events, so the web/desktop app can show
// native notifications while it is open (the phone gets a real FCM push; the
// desktop has no push channel, so it polls this instead). It is deliberately
// in-memory — a short-lived convenience, not durable history (the Audit Log is
// the durable record). Events older than the window, or beyond the cap, drop.
// ---------------------------------------------------------------------------
export interface NotifyEvent {
  id: string;
  key: NotifyActivityKey;
  title: string;
  body: string;
  actorId: string | null;
  timestamp: string; // ISO
}

const EVENT_WINDOW_MS = 2 * 60 * 60 * 1000; // keep ~2 hours
const EVENT_CAP = 300;
const recentEvents: NotifyEvent[] = [];

function recordEvent(key: NotifyActivityKey, title: string, body: string, actorId: string | null): void {
  recentEvents.push({ id: randomUUID(), key, title, body, actorId, timestamp: new Date().toISOString() });
  const cutoff = Date.now() - EVENT_WINDOW_MS;
  while (recentEvents.length && (recentEvents.length > EVENT_CAP || Date.parse(recentEvents[0].timestamp) < cutoff)) {
    recentEvents.shift();
  }
}

/**
 * Events after `sinceIso` that `user` should see: opted in via their notify prefs and NOT caused by
 * themselves. Newest last. Capped so a long absence can't flood the client.
 */
export function getRecentEventsFor(userId: string, preferences: unknown, sinceIso?: string): NotifyEvent[] {
  const sinceMs = sinceIso ? Date.parse(sinceIso) : 0;
  return recentEvents
    .filter(
      (e) =>
        e.actorId !== userId &&
        Date.parse(e.timestamp) > sinceMs &&
        wantsNotification(preferences, e.key)
    )
    .slice(-25);
}

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
  // Always record the event for the in-app (web/desktop) feed, even when Firebase push is off.
  recordEvent(key, title, body, actor.id);

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
