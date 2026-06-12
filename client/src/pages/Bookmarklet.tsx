import { useState } from "react";
import { BookmarkPlus, MousePointerClick, Smartphone, Chrome, CheckCircle2, Server } from "lucide-react";
import { Button } from "@/components/ui/button";

// The permanent app URL — this is what the bookmarklet opens.
// Falls back to the current page's origin if running on a custom domain.
const APP_URL = "https://www.perplexity.ai/computer/a/trinity-sales-mission-CEZmA3aASAWQIKSacbUOtg";

// When deployed to Render, this will be overridden by VITE_APP_URL env var
const FINAL_APP_URL = (import.meta.env.VITE_APP_URL as string) || APP_URL;

export default function BookmarkletPage() {
  const [copied, setCopied] = useState(false);

  // The bookmarklet opens the Add Event page with the current tab's URL pre-filled
  const bookmarkletCode = `javascript:(function(){var u=encodeURIComponent(location.href);window.open('${FINAL_APP_URL}/#/add?url='+u,'_blank','noopener');})();`;

  function handleCopy() {
    navigator.clipboard.writeText(bookmarkletCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Event Clipper</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Add this button to your browser toolbar. When you find an event on LinkedIn, Facebook, or any chamber site — click it and the form auto-fills.
        </p>
      </div>

      {/* The draggable bookmarklet */}
      <div className="rounded-xl border border-border bg-muted/30 p-6 text-center space-y-4">
        <p className="text-sm font-medium text-muted-foreground">
          Drag this button to your bookmarks bar:
        </p>
        <a
          href={bookmarkletCode}
          onClick={(e) => e.preventDefault()}
          draggable
          data-testid="bookmarklet-link"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm shadow-md cursor-grab active:cursor-grabbing select-none hover:bg-primary/90 transition-colors"
        >
          <BookmarkPlus size={16} />
          + Add to Sales Mission
        </a>
        <p className="text-xs text-muted-foreground">
          Drag the green button into your browser's bookmarks bar — do this once, use forever
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">How it works</h2>
        <div className="space-y-3">
          {[
            {
              icon: <BookmarkPlus size={18} className="text-primary" />,
              step: "1. Install once",
              detail: "Drag the green button above into your browser's bookmarks bar.",
            },
            {
              icon: <MousePointerClick size={18} className="text-primary" />,
              step: "2. Find an event",
              detail: "Browse to any event page — SA Chamber, LinkedIn, Facebook, Eventbrite, anywhere.",
            },
            {
              icon: <CheckCircle2 size={18} className="text-green-500" />,
              step: "3. Click the bookmark",
              detail: "The Add Event form opens in a new tab with the URL pre-loaded. The backend fetches the page and auto-fills title, date, time, and location. Review, pick who's attending, and save.",
            },
          ].map(({ icon, step, detail }) => (
            <div key={step} className="flex gap-4 items-start">
              <div className="mt-0.5 shrink-0">{icon}</div>
              <div>
                <p className="text-sm font-medium text-foreground">{step}</p>
                <p className="text-sm text-muted-foreground">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Backend note */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-4 flex gap-3">
        <Server size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">Deploy to Render for full auto-fill</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            The URL auto-fill feature requires the backend server to be running. Deploy to Render once and the backend is always live — the bookmarklet will auto-fill from any device, anywhere.
          </p>
        </div>
      </div>

      {/* Mobile / Safari */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone size={16} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Mobile / Safari</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Safari on iPhone doesn't support drag-to-toolbar. Instead:
        </p>
        <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
          <li>Tap <strong>Copy Code</strong> below</li>
          <li>Bookmark any page (Share → Add Bookmark)</li>
          <li>Edit the bookmark, delete the URL, paste the copied code</li>
          <li>Rename it <strong>+ Sales Mission</strong> and save</li>
        </ol>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          data-testid="button-copy-bookmarklet"
          className="mt-1"
        >
          {copied ? (
            <><CheckCircle2 size={14} className="mr-2 text-green-500" /> Copied!</>
          ) : (
            <><Chrome size={14} className="mr-2" /> Copy Bookmarklet Code</>
          )}
        </Button>
      </div>

      {/* Manual fallback */}
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <p className="text-sm font-medium text-foreground mb-1">No bookmark? No problem.</p>
        <p className="text-sm text-muted-foreground">
          Go to <strong>Add Event</strong>, paste any event URL into the top field — the form auto-fills within a second.
        </p>
      </div>
    </div>
  );
}
