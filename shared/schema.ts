import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const EVENT_TYPES = [
  "Chamber",
  "Networking",
  "Job Fair",
  "Trade Show",
  "Client Visit",
  "Prospect Meeting",
  "Other",
] as const;

export const ATTENDING_OPTIONS = ["Ryan", "Connie", "Both", "Tentative"] as const;

export const EVENT_STATUSES = ["upcoming", "attended", "cancelled", "postponed"] as const;

export const SOURCE_PLATFORMS = ["linkedin", "email", "chamber", "website", "manual"] as const;

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  eventType: text("event_type").notNull(),
  eventDate: text("event_date").notNull(), // ISO date string YYYY-MM-DD
  startTime: text("start_time").notNull(), // HH:MM
  endTime: text("end_time").notNull(),     // HH:MM
  location: text("location"),
  sourceUrl: text("source_url"),
  sourcePlatform: text("source_platform").notNull().default("manual"),
  sourceTextSnapshot: text("source_text_snapshot"),
  addedBy: text("added_by").notNull(),
  attending: text("attending").notNull(),
  notes: text("notes"),
  salesNotes: text("sales_notes"),
  reminderMinutes: integer("reminder_minutes"),
  status: text("status").notNull().default("upcoming"),
  outlookWebLink: text("outlook_web_link"),
  graphEventId: text("graph_event_id"), // reserved for future Graph sync
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  // Recurrence
  recurrenceRule: text("recurrence_rule"),   // "weekly" | "biweekly" | "monthly" | null
  recurrenceEnd: text("recurrence_end"),     // YYYY-MM-DD — last date to generate instances
  seriesId: text("series_id"),               // UUID shared by all events in a series
  seriesIndex: integer("series_index"),      // 0-based position within the series
});


export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  graphEventId: true,
  outlookWebLink: true,
});

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// ── Contacts (people met at events) ────────────────────────────────────────────
export const contacts = sqliteTable("contacts", {
  id:        integer("id").primaryKey({ autoIncrement: true }),
  eventId:   integer("event_id").notNull(),
  name:      text("name").notNull(),
  title:     text("title"),        // job title
  company:   text("company"),
  email:     text("email"),
  phone:     text("phone"),
  linkedin:  text("linkedin"),
  notes:     text("notes"),        // quick follow-up note
  hotLead:   integer("hot_lead").notNull().default(0), // 0=false, 1=true
  createdAt: text("created_at").notNull(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
});

export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

// ── Attendance Log ──────────────────────────────────────────────────────────
export const attendanceLog = sqliteTable("attendance_log", {
  id:               integer("id").primaryKey({ autoIncrement: true }),
  eventId:          integer("event_id").notNull(),
  userName:         text("user_name").notNull(),       // rep name
  planned:          integer("planned").notNull().default(1),   // 1=yes, 0=no
  attended:         integer("attended").notNull().default(0),  // 1=yes, 0=no
  checkInAt:        text("check_in_at"),               // ISO timestamp
  contactsCaptured: integer("contacts_captured").notNull().default(0),
  note:             text("note"),
  createdAt:        text("created_at").notNull(),
});

export const insertAttendanceSchema = createInsertSchema(attendanceLog).omit({ id: true, createdAt: true });
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type AttendanceRecord = typeof attendanceLog.$inferSelect;

// ── Follow-Ups ──────────────────────────────────────────────────────────────
export const followUps = sqliteTable("follow_ups", {
  id:          integer("id").primaryKey({ autoIncrement: true }),
  contactId:   integer("contact_id").notNull(),
  assignedTo:  text("assigned_to").notNull(),
  dueDate:     text("due_date").notNull(),             // YYYY-MM-DD
  status:      text("status").notNull().default("pending"), // pending | done | overdue
  completedAt: text("completed_at"),
  note:        text("note"),
  createdAt:   text("created_at").notNull(),
});

export const insertFollowUpSchema = createInsertSchema(followUps).omit({ id: true, createdAt: true });
export type InsertFollowUp = z.infer<typeof insertFollowUpSchema>;
export type FollowUp = typeof followUps.$inferSelect;

// ── CRM Exports ─────────────────────────────────────────────────────────────
export const crmExports = sqliteTable("crm_exports", {
  id:           integer("id").primaryKey({ autoIncrement: true }),
  exportedBy:   text("exported_by").notNull(),
  exportType:   text("export_type").notNull().default("csv"), // csv | touchpoint | salesforce | hubspot
  contactCount: integer("contact_count").notNull().default(0),
  exportedAt:   text("exported_at").notNull(),
});

export const insertCrmExportSchema = createInsertSchema(crmExports).omit({ id: true });
export type InsertCrmExport = z.infer<typeof insertCrmExportSchema>;
export type CrmExport = typeof crmExports.$inferSelect;
