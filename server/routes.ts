import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertEventSchema, insertContactSchema } from "@shared/schema";
import { z } from "zod";
import { randomUUID } from "crypto";

// ── Recurrence date generator ──────────────────────────────────────────────
function generateRecurrenceDates(
  startDate: string,   // YYYY-MM-DD
  rule: string,        // "weekly" | "biweekly" | "monthly"
  endDate: string      // YYYY-MM-DD (inclusive)
): string[] {
  const dates: string[] = [];
  const current = new Date(startDate + "T12:00:00");
  const end     = new Date(endDate   + "T12:00:00");
  let idx = 0;
  while (current <= end && idx < 104) { // cap at 104 occurrences (2 years weekly)
    dates.push(current.toISOString().split("T")[0]);
    if (rule === "weekly")   current.setDate(current.getDate() + 7);
    else if (rule === "biweekly") current.setDate(current.getDate() + 14);
    else if (rule === "monthly") current.setMonth(current.getMonth() + 1);
    else break;
    idx++;
  }
  return dates;
}
import * as cheerio from "cheerio";
import https from "https";
import http from "http";
import { sendNewEventNotification } from "./notify";
import { saveSubscription, removeSubscription, sendPushToAll } from "./push";

// ──────────────────────────────────────────────────
// URL Event Parser — fetch a page and heuristically
// extract event title, date, time, location, notes
// ──────────────────────────────────────────────────
function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; TrinityBot/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
      },
      (res) => {
        // Follow redirects (up to 1 hop)
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          fetchUrl(res.headers.location).then(resolve).catch(reject);
          return;
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

// ──────────────────────────────────────────────────
// Smart date extractor — works on raw text (LinkedIn paste etc.)
// Priority: explicit year > current/next year heuristic
// Returns YYYY-MM-DD or empty string
// ──────────────────────────────────────────────────
const MONTH_MAP: Record<string, number> = {
  january:1, jan:1, february:2, feb:2, march:3, mar:3,
  april:4, apr:4, may:5, june:6, jun:6, july:7, jul:7,
  august:8, aug:8, september:9, sep:9, sept:9,
  october:10, oct:10, november:11, nov:11, december:12, dec:12,
};

function toISODate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}

function bestYear(month: number, day: number): number {
  const now = new Date();
  const y = now.getFullYear();
  const candidate = new Date(y, month - 1, day);
  // If that date is already in the past by more than 3 days, use next year
  const diff = (candidate.getTime() - now.getTime()) / 86400000;
  return diff < -3 ? y + 1 : y;
}

function extractDateFromText(text: string): string {
  // Pattern 1: "June 30, 2026" / "Jun 30 2026" (with explicit year)
  const withYear = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(202\d)/gi;
  let m = withYear.exec(text);
  if (m) {
    const mo = MONTH_MAP[m[1].toLowerCase()];
    const day = parseInt(m[2]);
    const yr = parseInt(m[3]);
    if (mo && day >= 1 && day <= 31) return toISODate(yr, mo, day);
  }

  // Pattern 2: ISO "2026-06-30"
  const iso = /\b(202\d)-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) {
    const yr = parseInt(iso[1]), mo = parseInt(iso[2]), day = parseInt(iso[3]);
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) return toISODate(yr, mo, day);
  }

  // Pattern 3: MM/DD/YYYY
  const slashFull = /\b(\d{1,2})\/(\d{1,2})\/(202\d)\b/.exec(text);
  if (slashFull) {
    const mo = parseInt(slashFull[1]), day = parseInt(slashFull[2]), yr = parseInt(slashFull[3]);
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) return toISODate(yr, mo, day);
  }

  // Pattern 4: "June 30" or "Jun 30" — no year, infer from context
  const noYear = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;
  let best: string | null = null;
  let nm: RegExpExecArray | null;
  noYear.lastIndex = 0;
  while ((nm = noYear.exec(text)) !== null) {
    const mo = MONTH_MAP[nm[1].toLowerCase()];
    const day = parseInt(nm[2]);
    if (mo && day >= 1 && day <= 31) {
      const yr = bestYear(mo, day);
      best = toISODate(yr, mo, day);
      break; // take first good match
    }
  }
  if (best) return best;

  // Pattern 5: MM/DD or M/D — no year
  const slashShort = /\b(\d{1,2})\/(\d{1,2})\b/.exec(text);
  if (slashShort) {
    const mo = parseInt(slashShort[1]), day = parseInt(slashShort[2]);
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) {
      return toISODate(bestYear(mo, day), mo, day);
    }
  }

  return "";
}

function extractTimeFromText(text: string): { startTime: string; endTime: string } {
  let startTime = "";
  let endTime = "";
  // "6:00 PM – 8:00 PM" or "6 PM - 8:00 PM"
  const rangeMatch = text.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*[\-–—]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i
  );
  if (rangeMatch) {
    const toHH = (h: string, m: string, ap: string) => {
      let hr = parseInt(h);
      if (ap.toLowerCase() === "pm" && hr < 12) hr += 12;
      if (ap.toLowerCase() === "am" && hr === 12) hr = 0;
      return `${String(hr).padStart(2,"0")}:${(m ?? "00").padStart(2,"0")}`;
    };
    startTime = toHH(rangeMatch[1], rangeMatch[2], rangeMatch[3]);
    endTime = toHH(rangeMatch[4], rangeMatch[5], rangeMatch[6]);
  } else {
    const single = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (single) {
      let h = parseInt(single[1]);
      if (single[3].toLowerCase() === "pm" && h < 12) h += 12;
      if (single[3].toLowerCase() === "am" && h === 12) h = 0;
      startTime = `${String(h).padStart(2,"0")}:${(single[2] ?? "00").padStart(2,"0")}`;
    }
  }
  return { startTime, endTime };
}

function parseEventFromHtml(html: string, url: string) {
  const $ = cheerio.load(html);

  // Remove noise
  $("script, style, noscript, nav, footer, iframe").remove();

  // ── Title ──
  const ogTitle = $("meta[property='og:title']").attr("content");
  const twitterTitle = $("meta[name='twitter:title']").attr("content");
  const h1 = $("h1").first().text().trim();
  const pageTitle = $("title")
    .text()
    .replace(/\s*[|\-–—].*$/, "")
    .trim();
  const title = ogTitle || twitterTitle || h1 || pageTitle || "";

  // ── Description / Notes ──
  const ogDesc = $("meta[property='og:description']").attr("content");
  const metaDesc = $("meta[name='description']").attr("content");
  const notes = (ogDesc || metaDesc || "").slice(0, 300);

  // ── Location ──
  let location = "";
  $("script[type='application/ld+json']").each((_, el) => {
    if (location) return;
    try {
      const json = JSON.parse($(el).text());
      const entries = Array.isArray(json) ? json : [json];
      for (const entry of entries) {
        const loc = entry.location || entry.place;
        if (loc) {
          const name = loc.name || "";
          const addr = loc.address;
          const addrStr =
            typeof addr === "string"
              ? addr
              : addr
              ? [addr.streetAddress, addr.addressLocality, addr.addressRegion]
                  .filter(Boolean)
                  .join(", ")
              : "";
          location = [name, addrStr].filter(Boolean).join(", ");
        }
      }
    } catch {}
  });
  if (!location) {
    const bodyText = $("body").text();
    const locMatch = bodyText.match(
      /(?:location|venue|where)[:\s]+([^\n,]+(?:,\s*[^\n,]+)?)/i
    );
    if (locMatch) location = locMatch[1].trim().slice(0, 100);
  }

  // ── Date / Time ──
  let eventDate = "";
  let startTime = "";
  let endTime = "";

  // JSON-LD structured data (most reliable)
  $("script[type='application/ld+json']").each((_, el) => {
    if (eventDate) return;
    try {
      const json = JSON.parse($(el).text());
      const entries = Array.isArray(json) ? json : [json];
      for (const entry of entries) {
        const start = entry.startDate || entry.startTime;
        const end = entry.endDate || entry.endTime;
        if (start) {
          const d = new Date(start);
          if (!isNaN(d.getTime())) {
            eventDate = d.toISOString().split("T")[0];
            startTime = d.toTimeString().slice(0, 5);
          }
        }
        if (end) {
          const d = new Date(end);
          if (!isNaN(d.getTime())) {
            endTime = d.toTimeString().slice(0, 5);
          }
        }
        if (eventDate) break;
      }
    } catch {}
  });

  // Meta tags fallback
  if (!eventDate) {
    const metaStart = $(
      "meta[property='event:start_time'], meta[name='event:start_time']"
    ).attr("content");
    if (metaStart) {
      const d = new Date(metaStart);
      if (!isNaN(d.getTime())) {
        eventDate = d.toISOString().split("T")[0];
        startTime = d.toTimeString().slice(0, 5);
      }
    }
  }

  // Heuristic text scan
  if (!eventDate) {
    const bodyText = $("body").text();
    eventDate = extractDateFromText(bodyText);
    // Time heuristic
    if (!startTime) {
      const times = extractTimeFromText(bodyText);
      startTime = times.startTime;
      if (!endTime) endTime = times.endTime;
    }
  }

  // ── Source platform ──
  let sourcePlatform = "website";
  if (url.includes("linkedin.com")) sourcePlatform = "linkedin";
  else if (url.includes("facebook.com") || url.includes("fb.com"))
    sourcePlatform = "website";
  else if (
    url.includes("chamber") ||
    url.includes("sachamber") ||
    url.includes("greatersa")
  )
    sourcePlatform = "chamber";

  // ── Event type heuristic ──
  const combined = (title + " " + notes).toLowerCase();
  let eventType = "";
  if (/chamber|association/.test(combined)) eventType = "Chamber";
  else if (/job fair|career fair|hiring event/.test(combined))
    eventType = "Job Fair";
  else if (/trade show|expo|conference/.test(combined)) eventType = "Trade Show";
  else if (/network|mixer|happy hour|connect/.test(combined))
    eventType = "Networking";

  return {
    title,
    notes,
    location,
    eventDate,
    startTime,
    endTime,
    sourcePlatform,
    eventType,
    sourceUrl: url,
  };
}

export function registerRoutes(httpServer: Server, app: Express) {
  // ── Push subscription endpoints ────────────────────────────────────────────

  // POST /api/push/subscribe — save a push subscription from the browser
  app.post("/api/push/subscribe", (req, res) => {
    try {
      const sub = req.body;
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        return res.status(400).json({ error: "Invalid subscription object" });
      }
      const label = req.body.label || null;
      saveSubscription(sub, label);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // DELETE /api/push/subscribe — remove a subscription
  app.delete("/api/push/subscribe", (req, res) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ error: "endpoint required" });
      removeSubscription(endpoint);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // POST /api/push/test — send a test push to all subscribers
  app.post("/api/push/test", async (_req, res) => {
    try {
      await sendPushToAll({
        title: "RallyPoint",
        body:  "Push notifications are working!",
        url:   "/",
        tag:   "test",
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.json({ ok: false, error: err?.message });
    }
  });

  // GET /api/settings/status — returns whether SMTP is configured
  app.get("/api/settings/status", (_req, res) => {
    const configured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
    res.json({
      smtpConfigured: configured,
      smtpUser: configured ? process.env.SMTP_USER : undefined,
    });
  });

  // POST /api/settings/smtp — save SMTP credentials at runtime (sets process.env)
  app.post("/api/settings/smtp", (req, res) => {
    const { smtpUser, smtpPass } = req.body;
    if (!smtpUser || !smtpPass) {
      return res.status(400).json({ error: "smtpUser and smtpPass required" });
    }
    process.env.SMTP_USER = smtpUser;
    process.env.SMTP_PASS = smtpPass;
    res.json({ ok: true });
  });

  // POST /api/settings/test-email — send a test notification
  app.post("/api/settings/test-email", async (req, res) => {
    const { to } = req.body;
    try {
      await sendNewEventNotification({
        id: 0,
        title: "Test Event — Sales Mission",
        eventType: "Networking",
        eventDate: new Date().toISOString().split("T")[0],
        startTime: "18:00",
        endTime: "20:00",
        location: "Pearl Stable, San Antonio TX",
        attending: "Both",
        addedBy: "Ryan",
        notes: "This is a test notification from the Trinity Sales Mission dashboard.",
        sourceUrl: null,
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.json({ ok: false, error: err?.message });
    }
  });

  // POST /api/parse-text — extract event details from raw pasted text (LinkedIn, email, etc.)
  app.post("/api/parse-text", (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "text is required" });
      }
      const t = text.slice(0, 8000); // cap at 8k chars

      // Title — first non-blank line that looks like an event name (< 120 chars)
      const lines = t.split(/\n/).map(l => l.trim()).filter(Boolean);
      let title = "";
      for (const line of lines) {
        if (line.length > 5 && line.length < 120 && !/^https?:\/\//.test(line)) {
          title = line;
          break;
        }
      }

      // Date / Time
      const eventDate = extractDateFromText(t);
      const { startTime, endTime } = extractTimeFromText(t);

      // Location — look for venue/location labels
      let location = "";
      const locMatch = t.match(/(?:location|venue|where|address)[:\s]+([^\n,]+(?:,\s*[^\n,]+)?)/i);
      if (locMatch) location = locMatch[1].trim().slice(0, 100);

      // Event type heuristic
      const combined = t.toLowerCase();
      let eventType = "";
      if (/chamber|association/.test(combined)) eventType = "Chamber";
      else if (/job fair|career fair|hiring event/.test(combined)) eventType = "Job Fair";
      else if (/trade show|expo|conference/.test(combined)) eventType = "Trade Show";
      else if (/network|mixer|happy hour|connect/.test(combined)) eventType = "Networking";

      // Source platform
      let sourcePlatform = "manual";
      if (/linkedin/.test(combined)) sourcePlatform = "linkedin";
      else if (/chamber/.test(combined)) sourcePlatform = "chamber";

      res.json({ title, eventDate, startTime, endTime, location, eventType, sourcePlatform, notes: "" });
    } catch (err: any) {
      res.status(422).json({ error: "Could not parse text", detail: err?.message });
    }
  });

  // POST /api/parse-url — fetch a URL and extract event details
  app.post("/api/parse-url", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "url is required" });
      }
      const html = await fetchUrl(url);
      const result = parseEventFromHtml(html, url);
      res.json(result);
    } catch (err: any) {
      res
        .status(422)
        .json({
          error: "Could not fetch or parse that URL",
          detail: err?.message,
        });
    }
  });

  // GET /api/events — all events ordered by date
  app.get("/api/events", (_req, res) => {
    try {
      const allEvents = storage.getAllEvents();
      res.json(allEvents);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  // GET /api/events/upcoming — from today forward
  app.get("/api/events/upcoming", (_req, res) => {
    try {
      const upcoming = storage.getUpcomingEvents();
      res.json(upcoming);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch upcoming events" });
    }
  });

  // GET /api/events/:id
  app.get("/api/events/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const event = storage.getEventById(id);
      if (!event) return res.status(404).json({ error: "Event not found" });
      res.json(event);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch event" });
    }
  });

  // POST /api/events — create new event (supports recurring series)
  app.post("/api/events", async (req, res) => {
    try {
      const parsed = insertEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const data = parsed.data;

      // ── Recurring: generate all instances ─────────────────────────────────
      if (data.recurrenceRule && data.recurrenceEnd) {
        const dates = generateRecurrenceDates(data.eventDate, data.recurrenceRule, data.recurrenceEnd);
        if (dates.length === 0) {
          return res.status(400).json({ error: "No occurrences generated for that date range" });
        }
        const seriesId = randomUUID();
        const rows = dates.map((d, i) => ({
          ...data,
          eventDate: d,
          seriesId,
          seriesIndex: i,
        }));
        const created = storage.createEventBatch(rows);
        res.status(201).json(created); // returns array
        // Notify for first event only
        sendNewEventNotification(created[0]).catch((err) =>
          console.error("[notify] Email failed:", err?.message)
        );
        sendPushToAll({
          title: `New Recurring Event: ${created[0].title}`,
          body:  `${dates.length} occurrences starting ${created[0].eventDate}`,
          url:   "/",
          tag:   `series-${seriesId}`,
        }).catch((err) => console.error("[push] Failed:", err?.message));
        return;
      }

      // ── Single event (existing behaviour) ──────────────────────────────
      const event = storage.createEvent(data);
      res.status(201).json(event);
      sendNewEventNotification(event).catch((err) =>
        console.error("[notify] Email failed:", err?.message)
      );
      sendPushToAll({
        title: `New Event: ${event.title}`,
        body:  `${event.eventDate} · ${event.attending} attending`,
        url:   "/",
        tag:   `event-${event.id}`,
      }).catch((err) => console.error("[push] Failed:", err?.message));
    } catch (err) {
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  // PATCH /api/events/:id — update event
  // Optional body fields: scope = "this" | "future" | "all"
  app.patch("/api/events/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const scope: string = req.body.scope || "this";
      const { scope: _s, ...rest } = req.body;
      const updateSchema = insertEventSchema.partial();
      const parsed = updateSchema.safeParse(rest);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      // Series-wide update
      if (scope !== "this") {
        const existing = storage.getEventById(id);
        if (!existing) return res.status(404).json({ error: "Event not found" });
        if (existing.seriesId && existing.seriesIndex != null) {
          const fromIndex = scope === "future" ? existing.seriesIndex : 0;
          storage.updateEventsBySeries(existing.seriesId, fromIndex, parsed.data);
          res.json({ ok: true, scope, seriesId: existing.seriesId });
          return;
        }
      }

      // Single-event update
      const updated = storage.updateEvent(id, parsed.data);
      if (!updated) return res.status(404).json({ error: "Event not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update event" });
    }
  });

  // GET /api/events/:id/series — return all events in the same series
  app.get("/api/events/:id/series", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const event = storage.getEventById(id);
      if (!event || !event.seriesId) return res.json([]);
      res.json(storage.getEventsBySeriesId(event.seriesId));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch series" });
    }
  });

  // GET /api/events/:id/ics — download event as .ics calendar file
  app.get("/api/events/:id/ics", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const event = storage.getEventById(id);
      if (!event) return res.status(404).json({ error: "Event not found" });

      // Build iCalendar timestamps
      // eventDate is YYYY-MM-DD, startTime/endTime are HH:MM
      const toICS = (date: string, time: string): string => {
        // Format: 20260630T180000 (local time, no Z = floating/local)
        const [y, mo, d] = date.split("-");
        const [h, m] = time.split(":");
        return `${y}${mo}${d}T${h}${m}00`;
      };

      const dtStart = toICS(event.eventDate, event.startTime || "09:00");
      const dtEnd   = toICS(event.eventDate, event.endTime   || "10:00");
      const now     = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

      // Escape special chars per RFC 5545
      const esc = (s: string) =>
        (s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

      // Fold long lines at 75 octets per RFC 5545
      const fold = (line: string): string => {
        if (line.length <= 75) return line;
        const chunks: string[] = [];
        chunks.push(line.slice(0, 75));
        let i = 75;
        while (i < line.length) {
          chunks.push(" " + line.slice(i, i + 74));
          i += 74;
        }
        return chunks.join("\r\n");
      };

      const uid = `rallypoint-${event.id}-${Date.now()}@rallypoint.app`;
      const description = [
        event.notes          ? `Notes: ${event.notes}`       : "",
        (event as any).salesNotes ? `Sales Notes: ${(event as any).salesNotes}` : "",
        event.sourceUrl      ? `Source: ${event.sourceUrl}`  : "",
        `Added by: ${event.addedBy}`,
        `Attending: ${event.attending}`,
      ].filter(Boolean).join("\n");

      const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//RallyPoint//RallyPoint 1.0//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        fold(`UID:${uid}`),
        fold(`DTSTAMP:${now}`),
        fold(`DTSTART;TZID=America/Chicago:${dtStart}`),
        fold(`DTEND;TZID=America/Chicago:${dtEnd}`),
        fold(`SUMMARY:${esc(event.title)}`),
        event.location ? fold(`LOCATION:${esc(event.location)}`) : "",
        description    ? fold(`DESCRIPTION:${esc(description)}`)  : "",
        event.sourceUrl ? fold(`URL:${event.sourceUrl}`) : "",
        "END:VEVENT",
        "END:VCALENDAR",
      ].filter(s => s !== "").join("\r\n");

      const slug = event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${slug}.ics"`);
      res.send(lines);
    } catch (err) {
      res.status(500).json({ error: "Failed to generate calendar file" });
    }
  });

  // ── Contact routes ──────────────────────────────────────────────────

  // GET /api/contacts — all contacts across all events
  app.get("/api/contacts", (_req, res) => {
    try {
      const all = storage.getAllContacts();
      res.json(all);
    } catch (e) {
      console.error("getAllContacts error:", e);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  // GET /api/events/:id/contacts
  app.get("/api/events/:id/contacts", (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      res.json(storage.getContactsByEvent(eventId));
    } catch { res.status(500).json({ error: "Failed to fetch contacts" }); }
  });

  // POST /api/events/:id/contacts
  app.post("/api/events/:id/contacts", (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      const parsed = insertContactSchema.safeParse({ ...req.body, eventId });
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const contact = storage.createContact(parsed.data);
      res.status(201).json(contact);
    } catch { res.status(500).json({ error: "Failed to create contact" }); }
  });

  // PATCH /api/contacts/:id
  app.patch("/api/contacts/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = storage.updateContact(id, req.body);
      if (!updated) return res.status(404).json({ error: "Contact not found" });
      res.json(updated);
    } catch { res.status(500).json({ error: "Failed to update contact" }); }
  });

  // DELETE /api/contacts/:id
  app.delete("/api/contacts/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = storage.deleteContact(id);
      if (!deleted) return res.status(404).json({ error: "Contact not found" });
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Failed to delete contact" }); }
  });

  // DELETE /api/events/:id
  // Optional query: ?scope=this|future|all
  app.delete("/api/events/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const scope = (req.query.scope as string) || "this";

      if (scope !== "this") {
        const event = storage.getEventById(id);
        if (!event) return res.status(404).json({ error: "Event not found" });
        if (event.seriesId && event.seriesIndex != null) {
          const fromIndex = scope === "future" ? event.seriesIndex : 0;
          storage.deleteEventsBySeries(event.seriesId, fromIndex);
          res.json({ success: true, scope, deleted: "series" });
          return;
        }
      }

      const deleted = storage.deleteEvent(id);
      if (!deleted) return res.status(404).json({ error: "Event not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCOUNTABILITY ROUTES
  // ═══════════════════════════════════════════════════════════════════════════
  
  // GET /api/accountability/team — team-wide summary per rep
  app.get("/api/accountability/team", (_req, res) => {
    try {
      const { accountabilityStorage } = require("./storage");
      const summary = accountabilityStorage.getTeamSummary();
      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: "Failed to load team summary" });
    }
  });

  // GET /api/accountability/rep/:name — individual rep detail
  app.get("/api/accountability/rep/:name", (req, res) => {
    try {
      const { accountabilityStorage } = require("./storage");
      const data = accountabilityStorage.getRepDetail(req.params.name);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Failed to load rep detail" });
    }
  });

  // GET /api/follow-ups — all or filtered by ?assignedTo=
  app.get("/api/follow-ups", (req, res) => {
    try {
      const { accountabilityStorage } = require("./storage");
      const assignedTo = req.query.assignedTo as string | undefined;
      const items = accountabilityStorage.getFollowUps(assignedTo);
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: "Failed to load follow-ups" });
    }
  });

  // POST /api/follow-ups
  app.post("/api/follow-ups", (req, res) => {
    try {
      const { accountabilityStorage } = require("./storage");
      const item = accountabilityStorage.createFollowUp(req.body);
      res.status(201).json(item);
    } catch (err) {
      res.status(500).json({ error: "Failed to create follow-up" });
    }
  });

  // PATCH /api/follow-ups/:id
  app.patch("/api/follow-ups/:id", (req, res) => {
    try {
      const { accountabilityStorage } = require("./storage");
      const id = parseInt(req.params.id);
      const updated = accountabilityStorage.updateFollowUp(id, req.body);
      if (!updated) return res.status(404).json({ error: "Follow-up not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update follow-up" });
    }
  });

  // POST /api/attendance
  app.post("/api/attendance", (req, res) => {
    try {
      const { accountabilityStorage } = require("./storage");
      const record = accountabilityStorage.logAttendance(req.body);
      res.status(201).json(record);
    } catch (err) {
      res.status(500).json({ error: "Failed to log attendance" });
    }
  });

  // PATCH /api/attendance/:id
  app.patch("/api/attendance/:id", (req, res) => {
    try {
      const { accountabilityStorage } = require("./storage");
      const id = parseInt(req.params.id);
      const updated = accountabilityStorage.updateAttendance(id, req.body);
      if (!updated) return res.status(404).json({ error: "Attendance record not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update attendance" });
    }
  });

  // POST /api/crm-exports — log an export event
  app.post("/api/crm-exports", (req, res) => {
    try {
      const { accountabilityStorage } = require("./storage");
      const record = accountabilityStorage.logCrmExport({
        exportedBy: req.body.exportedBy,
        exportType: req.body.exportType || "csv",
        contactCount: req.body.contactCount || 0,
        exportedAt: new Date().toISOString(),
      });
      res.status(201).json(record);
    } catch (err) {
      res.status(500).json({ error: "Failed to log export" });
    }
  });

}