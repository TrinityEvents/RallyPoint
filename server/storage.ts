import Database from "better-sqlite3";
import type { Event, InsertEvent } from "@shared/schema";
import { resolve } from "path";
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
console.log("[storage] opening DB at:", DB_PATH);
const sqlite = new Database(DB_PATH);
console.log("[storage] DB opened OK");

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
    reminder_minutes INTEGER,
    status TEXT NOT NULL DEFAULT 'upcoming',
    outlook_web_link TEXT,
    graph_event_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);
console.log("[storage] schema ready");

function rowToEvent(row: any): Event {
  return {
    id: row.id,
    title: row.title,
    eventType: row.event_type,
    eventDate: row.event_date,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    sourceUrl: row.source_url,
    sourcePlatform: row.source_platform,
    sourceTextSnapshot: row.source_text_snapshot,
    addedBy: row.added_by,
    attending: row.attending,
    notes: row.notes,
    reminderMinutes: row.reminder_minutes,
    status: row.status,
    outlookWebLink: row.outlook_web_link,
    graphEventId: row.graph_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as Event;
}

export interface IStorage {
  getAllEvents(): Event[];
  getUpcomingEvents(): Event[];
  getEventById(id: number): Event | undefined;
  createEvent(data: InsertEvent): Event;
  updateEvent(id: number, data: Partial<InsertEvent>): Event | undefined;
  deleteEvent(id: number): boolean;
}

export const storage: IStorage = {
  getAllEvents(): Event[] {
    const rows = sqlite.prepare("SELECT * FROM events ORDER BY event_date DESC").all();
    return rows.map(rowToEvent);
  },

  getUpcomingEvents(): Event[] {
    const today = new Date().toISOString().split("T")[0];
    const rows = sqlite.prepare(
      "SELECT * FROM events WHERE event_date >= ? ORDER BY event_date ASC"
    ).all(today);
    return rows.map(rowToEvent);
  },

  getEventById(id: number): Event | undefined {
    const row = sqlite.prepare("SELECT * FROM events WHERE id = ?").get(id);
    return row ? rowToEvent(row) : undefined;
  },

  createEvent(data: InsertEvent): Event {
    const now = new Date().toISOString();
    const stmt = sqlite.prepare(`
      INSERT INTO events (
        title, event_type, event_date, start_time, end_time,
        location, source_url, source_platform, source_text_snapshot,
        added_by, attending, notes, reminder_minutes, status,
        outlook_web_link, graph_event_id, created_at, updated_at
      ) VALUES (
        @title, @eventType, @eventDate, @startTime, @endTime,
        @location, @sourceUrl, @sourcePlatform, @sourceTextSnapshot,
        @addedBy, @attending, @notes, @reminderMinutes, @status,
        @outlookWebLink, @graphEventId, @createdAt, @updatedAt
      )
    `);
    const result = stmt.run({
      title: data.title,
      eventType: data.eventType,
      eventDate: data.eventDate,
      startTime: data.startTime,
      endTime: data.endTime,
      location: data.location ?? null,
      sourceUrl: data.sourceUrl ?? null,
      sourcePlatform: data.sourcePlatform ?? "manual",
      sourceTextSnapshot: data.sourceTextSnapshot ?? null,
      addedBy: data.addedBy,
      attending: data.attending,
      notes: data.notes ?? null,
      reminderMinutes: data.reminderMinutes ?? null,
      status: data.status ?? "upcoming",
      outlookWebLink: data.outlookWebLink ?? null,
      graphEventId: data.graphEventId ?? null,
      createdAt: now,
      updatedAt: now,
    });
    return this.getEventById(Number(result.lastInsertRowid))!;
  },

  updateEvent(id: number, data: Partial<InsertEvent>): Event | undefined {
    const existing = this.getEventById(id);
    if (!existing) return undefined;
    const now = new Date().toISOString();
    const merged = { ...existing, ...data };
    sqlite.prepare(`
      UPDATE events SET
        title = @title,
        event_type = @eventType,
        event_date = @eventDate,
        start_time = @startTime,
        end_time = @endTime,
        location = @location,
        source_url = @sourceUrl,
        source_platform = @sourcePlatform,
        source_text_snapshot = @sourceTextSnapshot,
        added_by = @addedBy,
        attending = @attending,
        notes = @notes,
        reminder_minutes = @reminderMinutes,
        status = @status,
        outlook_web_link = @outlookWebLink,
        graph_event_id = @graphEventId,
        updated_at = @updatedAt
      WHERE id = @id
    `).run({
      title: merged.title,
      eventType: merged.eventType,
      eventDate: merged.eventDate,
      startTime: merged.startTime,
      endTime: merged.endTime,
      location: merged.location ?? null,
      sourceUrl: merged.sourceUrl ?? null,
      sourcePlatform: merged.sourcePlatform ?? "manual",
      sourceTextSnapshot: merged.sourceTextSnapshot ?? null,
      addedBy: merged.addedBy,
      attending: merged.attending,
      notes: merged.notes ?? null,
      reminderMinutes: merged.reminderMinutes ?? null,
      status: merged.status ?? "upcoming",
      outlookWebLink: merged.outlookWebLink ?? null,
      graphEventId: merged.graphEventId ?? null,
      updatedAt: now,
      id,
    });
    return this.getEventById(id);
  },

  deleteEvent(id: number): boolean {
    const result = sqlite.prepare("DELETE FROM events WHERE id = ?").run(id);
    return result.changes > 0;
  },
};
