/**
 * RallyPoint Push Notification Service
 * Uses web-push + VAPID.  Subscriptions stored in SQLite.
 */
import webpush from "web-push";
import Database from "better-sqlite3";
import { resolve } from "path";
import { existsSync, mkdirSync } from "fs";

// ── VAPID config ─────────────────────────────────────────────────────────────
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC  || "BBZYw_F2ZDqiFGoryOWVYNTKRcBWaqgYCLM9XxEyQCy7Jn6oVTxGsNJIcKObIikM2mg1_fRsIykm4uBg7Pe9yRY";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || "gsVhl1ay5V_QSSNsabbShsm7nweac9Ysz3UCdE4dUXY";

webpush.setVapidDetails("mailto:ryan@trinitystaffing.com", VAPID_PUBLIC, VAPID_PRIVATE);

// ── Subscription store (same DB file as events) ───────────────────────────────
function resolveDbPath(): string {
  const envPath = process.env.DATABASE_URL;
  if (envPath) {
    const dir = envPath.substring(0, envPath.lastIndexOf("/"));
    if (dir && !existsSync(dir)) {
      try { mkdirSync(dir, { recursive: true }); } catch {}
    }
    if (!dir || existsSync(dir)) return envPath;
  }
  return resolve(process.cwd(), "data.db");
}

const pushDb = new Database(resolveDbPath());
pushDb.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint  TEXT NOT NULL UNIQUE,
    p256dh    TEXT NOT NULL,
    auth      TEXT NOT NULL,
    label     TEXT,
    created_at TEXT NOT NULL
  )
`);

export function saveSubscription(sub: any, label?: string) {
  const { endpoint, keys } = sub;
  const now = new Date().toISOString();
  pushDb.prepare(`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, label, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, label=excluded.label
  `).run(endpoint, keys.p256dh, keys.auth, label ?? null, now);
}

export function removeSubscription(endpoint: string) {
  pushDb.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(endpoint);
}

export function getAllSubscriptions(): any[] {
  return pushDb.prepare(`SELECT * FROM push_subscriptions`).all();
}

// ── Send a push to all stored subscriptions ───────────────────────────────────
export async function sendPushToAll(payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}) {
  const subs = getAllSubscriptions();
  if (subs.length === 0) return;

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      ).catch(async (err: any) => {
        // 410 Gone = subscription expired/revoked — remove it
        if (err.statusCode === 410) removeSubscription(s.endpoint);
        throw err;
      })
    )
  );

  const ok  = results.filter((r) => r.status === "fulfilled").length;
  const bad = results.filter((r) => r.status === "rejected").length;
  console.log(`[push] sent to ${ok}/${subs.length} subscribers (${bad} failed)`);
}
