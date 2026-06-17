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
try { sqlite.exec(`ALTER TABLE events ADD COLUMN sales_notes TEXT`); } catch { /* already exists */ }
try { sqlite.exec(`ALTER TABLE events ADD COLUMN recurrence_rule TEXT`); } catch { /* already exists */ }
try { sqlite.exec(`ALTER TABLE events ADD COLUMN recurrence_end TEXT`); } catch { /* already exists */ }
try { sqlite.exec(`ALTER TABLE events ADD COLUMN series_id TEXT`); } catch { /* already exists */ }
try { sqlite.exec(`ALTER TABLE events ADD COLUMN series_index INTEGER`); } catch { /* already exists */ }

export interface IStorage {
  getAllEvents(): Event[];
  getUpcomingEvents(): Event[];
  getEventById(id: number): Event | undefined;
  createEvent(data: InsertEvent): Event;
  updateEvent(id: number, data: Partial<InsertEvent>): Event | undefined;
  deleteEvent(id: number): boolean;
  // Recurring series
  createEventBatch(rows: InsertEvent[]): Event[];
  getEventsBySeriesId(seriesId: string): Event[];
  updateEventsBySeries(seriesId: string, fromIndex: number, data: Partial<InsertEvent>): void;
  deleteEventsBySeries(seriesId: string, fromIndex: number): void;
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

  // ── Recurring series helpers ─────────────────────────────────────────
  createEventBatch(rows: InsertEvent[]): Event[] {
    const now = new Date().toISOString();
    const insert = db.insert(events).values(
      rows.map(r => ({ ...r, createdAt: now, updatedAt: now }))
    ).returning();
    return insert.all();
  },

  getEventsBySeriesId(seriesId: string): Event[] {
    return sqlite.prepare(
      `SELECT * FROM events WHERE series_id = ? ORDER BY series_index ASC`
    ).all(seriesId) as Event[];
  },

  updateEventsBySeries(seriesId: string, fromIndex: number, data: Partial<InsertEvent>): void {
    // Build SET clause dynamically from data keys
    const now = new Date().toISOString();
    const colMap: Record<string, string> = {
      title: 'title', eventType: 'event_type', startTime: 'start_time',
      endTime: 'end_time', location: 'location', notes: 'notes',
      salesNotes: 'sales_notes', attending: 'attending', addedBy: 'added_by',
      status: 'status', reminderMinutes: 'reminder_minutes',
    };
    const setClauses: string[] = ['updated_at = ?'];
    const vals: unknown[] = [now];
    for (const [key, col] of Object.entries(colMap)) {
      if (key in data) {
        setClauses.push(`${col} = ?`);
        vals.push((data as Record<string, unknown>)[key] ?? null);
      }
    }
    vals.push(seriesId, fromIndex);
    sqlite.prepare(
      `UPDATE events SET ${setClauses.join(', ')} WHERE series_id = ? AND series_index >= ?`
    ).run(...vals);
  },

  deleteEventsBySeries(seriesId: string, fromIndex: number): void {
    sqlite.prepare(
      `DELETE FROM events WHERE series_id = ? AND series_index >= ?`
    ).run(seriesId, fromIndex);
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

// ══════════════════════════════════════════════════════════════════════════════
// ACCOUNTABILITY — DB SETUP + STORAGE METHODS
// ══════════════════════════════════════════════════════════════════════════════

import {
  attendanceLog, followUps, crmExports,
  type AttendanceRecord, type InsertAttendance,
  type FollowUp, type InsertFollowUp,
  type CrmExport, type InsertCrmExport,
} from "@shared/schema";

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS attendance_log (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id           INTEGER NOT NULL,
    user_name          TEXT NOT NULL,
    planned            INTEGER NOT NULL DEFAULT 1,
    attended           INTEGER NOT NULL DEFAULT 0,
    check_in_at        TEXT,
    contacts_captured  INTEGER NOT NULL DEFAULT 0,
    note               TEXT,
    created_at         TEXT NOT NULL
  )
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS follow_ups (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id   INTEGER NOT NULL,
    assigned_to  TEXT NOT NULL,
    due_date     TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    completed_at TEXT,
    note         TEXT,
    created_at   TEXT NOT NULL
  )
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS crm_exports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    exported_by   TEXT NOT NULL,
    export_type   TEXT NOT NULL DEFAULT 'csv',
    contact_count INTEGER NOT NULL DEFAULT 0,
    exported_at   TEXT NOT NULL
  )
`);

// ── Accountability storage methods ──────────────────────────────────────────

export const accountabilityStorage = {
  // --- Attendance ---
  logAttendance(data: InsertAttendance): AttendanceRecord {
    const now = new Date().toISOString();
    return db.insert(attendanceLog).values({ ...data, createdAt: now }).returning().get();
  },

  updateAttendance(id: number, data: Partial<InsertAttendance>): AttendanceRecord | undefined {
    return db.update(attendanceLog).set(data).where(eq(attendanceLog.id, id)).returning().get();
  },

  getAttendanceByEvent(eventId: number): AttendanceRecord[] {
    return db.select().from(attendanceLog).where(eq(attendanceLog.eventId, eventId)).all();
  },

  // --- Team summary: per-rep aggregated stats ---
  getTeamSummary(): Array<{
    userName: string;
    eventsPlanned: number;
    eventsAttended: number;
    contactsCaptured: number;
    followUpTotal: number;
    followUpDone: number;
    crmExports: number;
  }> {
    const attendance = sqlite.prepare(`
      SELECT
        user_name           AS userName,
        SUM(planned)        AS eventsPlanned,
        SUM(attended)       AS eventsAttended,
        SUM(contacts_captured) AS contactsCaptured
      FROM attendance_log
      GROUP BY user_name
    `).all() as { userName: string; eventsPlanned: number; eventsAttended: number; contactsCaptured: number }[];

    const followUpsByRep = sqlite.prepare(`
      SELECT
        assigned_to           AS userName,
        COUNT(*)              AS total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
      FROM follow_ups
      GROUP BY assigned_to
    `).all() as { userName: string; total: number; done: number }[];

    const exportsByRep = sqlite.prepare(`
      SELECT exported_by AS userName, COUNT(*) AS cnt
      FROM crm_exports GROUP BY exported_by
    `).all() as { userName: string; cnt: number }[];

    const fuMap = Object.fromEntries(followUpsByRep.map(r => [r.userName, r]));
    const exMap = Object.fromEntries(exportsByRep.map(r => [r.userName, r]));

    return attendance.map(row => ({
      userName: row.userName,
      eventsPlanned: row.eventsPlanned || 0,
      eventsAttended: row.eventsAttended || 0,
      contactsCaptured: row.contactsCaptured || 0,
      followUpTotal: fuMap[row.userName]?.total || 0,
      followUpDone: fuMap[row.userName]?.done || 0,
      crmExports: exMap[row.userName]?.cnt || 0,
    }));
  },

  // --- Rep detail ---
  getRepDetail(userName: string): {
    attendance: AttendanceRecord[];
    followUps: FollowUp[];
    exports: CrmExport[];
  } {
    const attendance = db.select().from(attendanceLog)
      .where(eq(attendanceLog.userName, userName)).all();
    const fus = db.select().from(followUps)
      .where(eq(followUps.assignedTo, userName)).all();
    const exps = db.select().from(crmExports)
      .where(eq(crmExports.exportedBy, userName)).all();
    return { attendance, followUps: fus, exports: exps };
  },

  // --- Follow-ups ---
  createFollowUp(data: InsertFollowUp): FollowUp {
    const now = new Date().toISOString();
    return db.insert(followUps).values({ ...data, createdAt: now }).returning().get();
  },

  updateFollowUp(id: number, data: Partial<InsertFollowUp>): FollowUp | undefined {
    return db.update(followUps).set(data).where(eq(followUps.id, id)).returning().get();
  },

  getFollowUps(assignedTo?: string): FollowUp[] {
    if (assignedTo) {
      return db.select().from(followUps).where(eq(followUps.assignedTo, assignedTo)).all();
    }
    return db.select().from(followUps).all();
  },

  getOverdueFollowUps(): FollowUp[] {
    const today = new Date().toISOString().split("T")[0];
    return sqlite.prepare(`
      SELECT * FROM follow_ups
      WHERE status != 'done' AND due_date < ?
      ORDER BY due_date ASC
    `).all(today) as FollowUp[];
  },

  // --- CRM exports ---
  logCrmExport(data: InsertCrmExport): CrmExport {
    return db.insert(crmExports).values(data).returning().get();
  },
};
