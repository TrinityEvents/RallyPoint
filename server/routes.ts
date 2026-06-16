import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertEventSchema } from "@shared/schema";
import { z } from "zod";
import * as cheerio from "cheerio";
import https from "https";
import http from "http";
import { sendNewEventNotification } from "./notify";

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

  // POST /api/events — create new event
  app.post("/api/events", async (req, res) => {
    try {
      const parsed = insertEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const event = storage.createEvent(parsed.data);
      res.status(201).json(event);
      // Fire-and-forget notification — never blocks the response
      sendNewEventNotification(event).catch((err) =>
        console.error("[notify] Email failed:", err?.message)
      );
    } catch (err) {
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  // PATCH /api/events/:id — update event
  app.patch("/api/events/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateSchema = insertEventSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const updated = storage.updateEvent(id, parsed.data);
      if (!updated) return res.status(404).json({ error: "Event not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update event" });
    }
  });

  // DELETE /api/events/:id
  app.delete("/api/events/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = storage.deleteEvent(id);
      if (!deleted) return res.status(404).json({ error: "Event not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete event" });
    }
  });
}
