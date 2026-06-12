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
    const datePatterns = [
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(202\d)/gi,
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}),?\s+(202\d)/gi,
      /\b(202\d)-(\d{2})-(\d{2})\b/g,
      /\b(\d{1,2})\/(\d{1,2})\/(202\d)\b/g,
    ];
    for (const pat of datePatterns) {
      const match = bodyText.match(pat);
      if (match) {
        const d = new Date(match[0]);
        if (!isNaN(d.getTime())) {
          eventDate = d.toISOString().split("T")[0];
          break;
        }
      }
    }
    // Time heuristic
    const timeMatch = bodyText.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (timeMatch && !startTime) {
      const [, hr, min = "00", ampm] = timeMatch;
      let h = parseInt(hr);
      if (ampm.toLowerCase() === "pm" && h < 12) h += 12;
      if (ampm.toLowerCase() === "am" && h === 12) h = 0;
      startTime = `${String(h).padStart(2, "0")}:${min}`;
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
