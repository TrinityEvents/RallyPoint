import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { events, type Event, type InsertEvent } from "@shared/schema";
import { eq, desc, gte } from "drizzle-orm";
import { resolve } from "path";

// Simple local DB - works on any platform
const DB_PATH = resolve(process.cwd(), "data.db");
console.log("[db] using path:", DB_PATH);
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
    source_platform TEXT DEFAULT 'manual',
    source_text_snapshot TEXT,
    added_by TEXT NOT NULL DEFAULT 'Ryan',
    attending TEXT NOT NULL DEFAULT 'Ryan',
    notes TEXT,
    reminder_minutes INTEGER DEFAULT 60,
    status TEXT DEFAULT 'upcoming',
    outlook_web_link TEXT,
    graph_event_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

export interface IStorage {
  getEvents(): Event[];
  getUpcomingEvents(): Event[];
  getEventById(id: number): Event | undefined;
  createEvent(event: InsertEvent): Event;
  updateEvent(id: number, event: Partial<InsertEvent>): Event | undefined;
  deleteEvent(id: number): boolean;
}

class SqliteStorage implements IStorage {
  getEvents(): Event[] {
    return db.select().from(events).orderBy(desc(events.eventDate)).all();
  }

  getUpcomingEvents(): Event[] {
    const today = new Date().toISOString().split("T")[0];
    return db.select().from(events)
      .where(gte(events.eventDate, today))
      .orderBy(events.eventDate)
      .all();
  }

  getEventById(id: number): Event | undefined {
    return db.select().from(events).where(eq(events.id, id)).get();
  }

  createEvent(event: InsertEvent): Event {
    return db.insert(events).values(event).returning().get();
  }

  updateEvent(id: number, event: Partial<InsertEvent>): Event | undefined {
    return db.update(events).set({ ...event, updatedAt: new Date().toISOString() })
      .where(eq(events.id, id)).returning().get();
  }

  deleteEvent(id: number): boolean {
    const result = db.delete(events).where(eq(events.id, id)).run();
    return result.changes > 0;
  }
}

export const storage = new SqliteStorage();
