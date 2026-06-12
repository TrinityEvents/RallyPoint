/**
 * Trinity Sales Mission — Email Notifications
 *
 * Sends a notification email to both Ryan and Connie whenever
 * a new event is added to the calendar.
 *
 * Credentials come from environment variables (set in Render or .env):
 *   SMTP_USER     — your Microsoft 365 email (e.g. ryan@trinitystaffing.com)
 *   SMTP_PASS     — your M365 app password (NOT your regular login password)
 *   NOTIFY_FROM   — optional "from" display name (defaults to "Trinity Sales Mission")
 *
 * To generate an M365 app password:
 *   1. Go to https://account.microsoft.com/security
 *   2. Advanced security options → App passwords → Create
 *   3. Copy the 16-char password into SMTP_PASS
 */

import nodemailer from "nodemailer";

const RYAN  = "ryan@trinitystaffing.com";
const CONNIE = "connie@trinitystaffing.com";

function createTransport() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) return null;

  return nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false, // STARTTLS
    auth: { user, pass },
    tls: { ciphers: "SSLv3" },
  });
}

function formatDate(dateStr: string) {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr + "T12:00:00"); // noon local avoids timezone shift
  return d.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
}

function formatTime(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

export interface EventSummary {
  id: number;
  title: string;
  eventType: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  location?: string | null;
  attending: string;
  addedBy: string;
  notes?: string | null;
  sourceUrl?: string | null;
}

export async function sendNewEventNotification(event: EventSummary): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    // Credentials not set — log and skip silently so the save still works
    console.log("[notify] SMTP_USER/SMTP_PASS not set — skipping email notification");
    return;
  }

  const addedBy = event.addedBy || "Someone";
  const notifyOther = addedBy === "Ryan" ? CONNIE : addedBy === "Connie" ? RYAN : CONNIE;
  // Always notify both — the adder gets a confirmation, the other gets an alert
  const recipients = [RYAN, CONNIE];

  const dateStr  = formatDate(event.eventDate);
  const timeStr  = event.startTime
    ? `${formatTime(event.startTime)}${event.endTime ? " – " + formatTime(event.endTime) : ""}`
    : "";

  const appUrl = process.env.APP_URL || "https://www.perplexity.ai/computer/a/trinity-sales-mission-CEZmA3aASAWQIKSacbUOtg";

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f8; margin: 0; padding: 0; }
    .wrapper { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: hsl(183, 85%, 23%); color: white; padding: 20px 28px; }
    .header h1 { margin: 0; font-size: 18px; font-weight: 600; }
    .header p  { margin: 4px 0 0; font-size: 12px; opacity: 0.7; }
    .body { padding: 24px 28px; }
    .event-title { font-size: 20px; font-weight: 700; color: #1a1a1a; margin: 0 0 16px; }
    .meta { display: table; width: 100%; border-collapse: collapse; }
    .row { display: table-row; }
    .label { display: table-cell; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding: 5px 12px 5px 0; white-space: nowrap; vertical-align: top; }
    .value { display: table-cell; color: #111; font-size: 14px; padding: 5px 0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: hsl(183, 85%, 93%); color: hsl(183, 85%, 20%); }
    .notes { background: #f9fafb; border-left: 3px solid hsl(183, 85%, 40%); border-radius: 4px; padding: 10px 14px; margin-top: 16px; font-size: 13px; color: #374151; line-height: 1.5; }
    .cta { margin-top: 24px; text-align: center; }
    .btn { display: inline-block; background: hsl(183, 85%, 23%); color: white !important; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; font-weight: 600; }
    .footer { background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 14px 28px; font-size: 11px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Trinity Staffing · Sales Mission</h1>
      <p>New event added by ${addedBy}</p>
    </div>
    <div class="body">
      <p class="event-title">${event.title}</p>
      <div class="meta">
        ${event.eventType ? `<div class="row"><div class="label">Type</div><div class="value"><span class="badge">${event.eventType}</span></div></div>` : ""}
        ${dateStr ? `<div class="row"><div class="label">Date</div><div class="value">${dateStr}</div></div>` : ""}
        ${timeStr ? `<div class="row"><div class="label">Time</div><div class="value">${timeStr}</div></div>` : ""}
        ${event.location ? `<div class="row"><div class="label">Location</div><div class="value">${event.location}</div></div>` : ""}
        <div class="row"><div class="label">Attending</div><div class="value">${event.attending}</div></div>
        ${event.sourceUrl ? `<div class="row"><div class="label">Source</div><div class="value"><a href="${event.sourceUrl}" style="color:hsl(183,85%,25%)">View original event</a></div></div>` : ""}
      </div>
      ${event.notes ? `<div class="notes">${event.notes}</div>` : ""}
      <div class="cta">
        <a class="btn" href="${appUrl}">Open Sales Calendar</a>
      </div>
    </div>
    <div class="footer">Trinity Staffing Services · San Antonio, TX · Sales Mission Dashboard</div>
  </div>
</body>
</html>
  `.trim();

  const textBody = [
    `New event added by ${addedBy}`,
    ``,
    `${event.title}`,
    event.eventType ? `Type: ${event.eventType}` : "",
    dateStr          ? `Date: ${dateStr}` : "",
    timeStr          ? `Time: ${timeStr}` : "",
    event.location   ? `Location: ${event.location}` : "",
    `Attending: ${event.attending}`,
    event.notes      ? `\nNotes: ${event.notes}` : "",
    ``,
    `Open calendar: ${appUrl}`,
  ].filter(l => l !== undefined).join("\n");

  await transport.sendMail({
    from: `"Trinity Sales Mission" <${process.env.SMTP_USER}>`,
    to: recipients.join(", "),
    subject: `📅 New event: ${event.title}${dateStr ? " · " + dateStr : ""}`,
    text: textBody,
    html: htmlBody,
  });

  console.log(`[notify] Email sent for "${event.title}" to ${recipients.join(", ")}`);
}
