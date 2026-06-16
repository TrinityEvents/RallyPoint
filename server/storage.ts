import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { events, contacts, type Event, type InsertEvent, type Contact, type InsertContact } from "@shared/schema";
import { eq, desc, gte } from "drizzle-orm";
import { resolve } from "path";

// On Render: DATABASE_URL=/data/data.db (persistent disk) if disk is mounted.
// Falls back to data.db in project root if /data dir doesn't exist (free tier).
import { existsSync, mkdirSync } from "fs";
function resolveDbPath(): string {
  const envPath = process.env.DATABASE_URL;
  if (envPath) {
    const dir = envPath.substring(0, envPath.lastIndexOf("/"));
    if (dir && !existsSync(dir)) {
      try { mkdirSync(dir, { recursive: true }); } catch { /* fall through */ }
    }
    if (!dir || existsSync(dir)) return envPath;
  }
  return resolve(process.cwd(), "data.db");
}
const DB_PATH = resolveDbPath();
const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite);

// Create table if not exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    location TEXT,
    source_url TEXT,
    source_platform TEXT NOT NULL DEFAULT 'manual',
    source_text_snapshot TEXT,
    added_by TEXT NOT NULL,
    attending TEXT NOT NULL,
    notes TEXT,
    sales_notes TEXT,
    reminder_minutes INTEGER,
    status TEXT NOT NULL DEFAULT 'upcoming',
    outlook_web_link TEXT,
    graph_event_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// Create contacts table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id   INTEGER NOT NULL,
    name       TEXT NOT NULL,
    title      TEXT,
    company    TEXT,
    email      TEXT,
    phone      TEXT,
    linkedin   TEXT,
    notes      TEXT,
    hot_lead   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )
`);

// ── Migrations: add columns to existing DB if missing ──────────────────────
try { sqlite.exec(`ALTER TABLE events ADD COLUMN sales_notes TEXT`); } catch { /* column already exists */ }

export interface IStorage {
  getAllEvents(): Event[];
  getUpcomingEvents(): Event[];
  getEventById(id: number): Event | undefined;
  createEvent(data: InsertEvent): Event;
  updateEvent(id: number, data: Partial<InsertEvent>): Event | undefined;
  deleteEvent(id: number): boolean;
  // Contacts
  getAllContacts(): (Contact & { eventTitle: string; eventType: string; eventDate: string | null })[]; 
  getContactsByEvent(eventId: number): Contact[];
  createContact(data: InsertContact): Contact;
  updateContact(id: number, data: Partial<InsertContact>): Contact | undefined;
  deleteContact(id: number): boolean;
}

export const storage: IStorage = {
  getAllEvents(): Event[] {
    return db.select().from(events).orderBy(desc(events.eventDate)).all();
  },

  getUpcomingEvents(): Event[] {
    const today = new Date().toISOString().split("T")[0];
    return db.select().from(events)
      .where(gte(events.eventDate, today))
      .orderBy(events.eventDate)
      .all();
  },

  getEventById(id: number): Event | undefined {
    return db.select().from(events).where(eq(events.id, id)).get();
  },

  createEvent(data: InsertEvent): Event {
    const now = new Date().toISOString();
    return db.insert(events).values({
      ...data,
      createdAt: now,
      updatedAt: now,
    }).returning().get();
  },

  updateEvent(id: number, data: Partial<InsertEvent>): Event | undefined {
    const now = new Date().toISOString();
    const result = db.update(events)
      .set({ ...data, updatedAt: now })
      .where(eq(events.id, id))
      .returning()
      .get();
    return result;
  },

  deleteEvent(id: number): boolean {
    const result = db.delete(events).where(eq(events.id, id)).run();
    return result.changes > 0;
  },

  // ── Contacts ─────────────────────────────────────────────────────
  getAllContacts() {
    return sqlite.prepare(`
      SELECT c.*, e.title as eventTitle, e.event_type as eventType, e.event_date as eventDate
      FROM contacts c
      LEFT JOIN events e ON c.event_id = e.id
      ORDER BY c.created_at DESC
    `).all() as (Contact & { eventTitle: string; eventType: string; eventDate: string | null })[];
  },

  getContactsByEvent(eventId: number): Contact[] {
    return db.select().from(contacts).where(eq(contacts.eventId, eventId)).all();
  },

  createContact(data: InsertContact): Contact {
    const now = new Date().toISOString();
    return db.insert(contacts).values({ ...data, createdAt: now }).returning().get();
  },

  updateContact(id: number, data: Partial<InsertContact>): Contact | undefined {
    return db.update(contacts).set(data).where(eq(contacts.id, id)).returning().get();
  },

  deleteContact(id: number): boolean {
    const result = db.delete(contacts).where(eq(contacts.id, id)).run();
    return result.changes > 0;
  },
};
