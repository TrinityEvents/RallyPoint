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
  eventDate: text("event_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  location: text("location"),
  sourceUrl: text("source_url"),
  sourcePlatform: text("source_platform").notNull().default("manual"),
  sourceTextSnapshot: text("source_text_snapshot"),
  addedBy: text("added_by").notNull(),
  attending: text("attending").notNull(),
  notes: text("notes"),
  reminderMinutes: integer("reminder_minutes"),
  status: text("status").notNull().default("upcoming"),
  outlookWebLink: text("outlook_web_link"),
  graphEventId: text("graph_event_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
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
