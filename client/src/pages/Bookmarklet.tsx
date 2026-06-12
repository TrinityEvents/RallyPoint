import { useState } from "react";
import { BookmarkPlus, CheckCircle2, Smartphone, Monitor, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const APP_URL = "https://rallypoint-x1zd.onrender.com";
const FINAL_APP_URL = (import.meta.env.VITE_APP_URL as string) || APP_URL;

const bookmarkletCode = `javascript:(function(){var u=encodeURIComponent(location.href);window.open('${FINAL_APP_URL}/#/add?url='+u,'_blank','noopener');})();`;

type Tab = "iphone" | "android" | "desktop";

export default function BookmarkletPage() {
  const [tab, setTab] = useState<Tab>("iphone");
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(bookmarkletCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "iphone",  label: "iPhone",   icon: <Smartphone size={14} /> },
    { id: "android", label: "Android",  icon: <Smartphone size={14} /> },
    { id: "desktop", label: "Desktop",  icon: <Monitor size={14} /> },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Event Clipper</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse to any event page and clip it straight into RallyPoint — title, date, time, and location auto-fill.
        </p>
      </div>

      {/* Device tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors",
              tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* iPhone */}
      {tab === "iphone" && (
        <div className="space-y-5">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Share2 size={16} className="text-primary" />
              <h2 className="text-sm font-semibold">Set up once in Safari (2 minutes)</h2>
            </div>
            <ol className="space-y-4">
              {[
                {
                  n: "1",
                  title: "Copy the clipper code",
                  body: <>Tap the button below to copy the code.</>,
                  action: (
                    <Button size="sm" variant="outline" onClick={handleCopy} data-testid="btn-copy-iphone" className="mt-2">
                      {copied
                        ? <><CheckCircle2 size={14} className="mr-2 text-green-500"/>Copied!</>
                        : <><Copy size={14} className="mr-2"/>Copy Clipper Code</>
                      }
                    </Button>
                  )
                },
                {
                  n: "2",
                  title: "Bookmark any page",
                  body: <>Open Safari, tap the <strong>Share</strong> button (box with arrow) → tap <strong>"Add Bookmark"</strong> → save it anywhere.</>,
                },
                {
                  n: "3",
                  title: "Edit the bookmark",
                  body: <>Tap the bookmark icon → <strong>Edit</strong> the bookmark you just made → <strong>delete the URL</strong> and paste the copied code → rename it <strong>"+ RallyPoint"</strong> → tap Done.</>,
                },
                {
                  n: "4",
                  title: "Use it on any event page",
                  body: <>Browse to an event on Safari. Tap the bookmark icon → tap <strong>"+ RallyPoint"</strong>. RallyPoint opens with the event auto-filled. Review and save.</>,
                },
              ].map(({ n, title, body, action }) => (
                <li key={n} className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{body}</p>
                    {action}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-sm font-medium text-foreground mb-1">Shortcut — skip the bookmarklet</p>
            <p className="text-sm text-muted-foreground">
              Open RallyPoint → <strong>Add Event</strong> → paste any event URL in the URL field. It auto-fills in about 1 second. No setup needed.
            </p>
          </div>
        </div>
      )}

      {/* Android */}
      {tab === "android" && (
        <div className="space-y-5">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Smartphone size={16} className="text-primary" />
              <h2 className="text-sm font-semibold">Option A — Kiwi Browser (full extension)</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Kiwi Browser is a free Chrome-based Android browser that supports desktop Chrome extensions — including the RallyPoint extension you already have.
            </p>
            <ol className="space-y-3">
              {[
                "Install Kiwi Browser from the Google Play Store",
                'Open Kiwi → tap the menu (⋮) → "Extensions" → enable "Allow from unknown sources"',
                "Download the RallyPoint extension zip from the Clipper tab on desktop",
                'In Kiwi Extensions → tap "+" → load the zip file',
                "Browse to any event page — tap the RallyPoint icon in the toolbar",
              ].map((step, i) => (
                <li key={i} className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i+1}</div>
                  <p className="text-sm text-muted-foreground">{step}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <BookmarkPlus size={16} className="text-primary" />
              <h2 className="text-sm font-semibold">Option B — Bookmarklet in Chrome Android</h2>
            </div>
            <ol className="space-y-3">
              {[
                <>Tap <strong>Copy Clipper Code</strong> below</>,
                <>In Chrome, bookmark any page (Share → Add to Bookmarks)</>,
                <>Open bookmarks → long-press the new bookmark → <strong>Edit</strong> → delete the URL, paste the code → rename <strong>"+ RallyPoint"</strong></>,
                <>On any event page, tap the address bar → type "Rally" → tap the bookmark to run it</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i+1}</div>
                  <p className="text-sm text-muted-foreground">{step}</p>
                </li>
              ))}
            </ol>
            <Button size="sm" variant="outline" onClick={handleCopy} data-testid="btn-copy-android">
              {copied
                ? <><CheckCircle2 size={14} className="mr-2 text-green-500"/>Copied!</>
                : <><Copy size={14} className="mr-2"/>Copy Clipper Code</>
              }
            </Button>
          </div>
        </div>
      )}

      {/* Desktop */}
      {tab === "desktop" && (
        <div className="space-y-5">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Monitor size={16} className="text-primary" />
              <h2 className="text-sm font-semibold">Chrome / Edge Extension (recommended)</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Download the extension zip and load it in Chrome or Edge for the best experience — one-click clipping from any tab.
            </p>
            <ol className="space-y-3">
              {[
                <>Download the <strong>RallyPoint extension zip</strong> from your Perplexity session</>,
                <>Open Chrome → go to <code className="bg-muted px-1 rounded text-xs">chrome://extensions</code></>,
                <>Enable <strong>Developer mode</strong> (top right toggle)</>,
                <>Click <strong>Load unpacked</strong> → select the unzipped extension folder</>,
                <>The RallyPoint icon appears in your toolbar — click it on any event page</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i+1}</div>
                  <p className="text-sm text-muted-foreground">{step}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <BookmarkPlus size={16} className="text-primary" />
              <h2 className="text-sm font-semibold">Bookmarklet (any desktop browser)</h2>
            </div>
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-4">Drag this to your bookmarks bar:</p>
              <a
                href={bookmarkletCode}
                onClick={(e) => e.preventDefault()}
                draggable
                data-testid="bookmarklet-drag"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm shadow-md cursor-grab active:cursor-grabbing select-none hover:bg-primary/90 transition-colors"
              >
                <BookmarkPlus size={16} />
                + RallyPoint
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
