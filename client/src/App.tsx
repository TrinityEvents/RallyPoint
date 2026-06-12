import { Switch, Route, Router, Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useState, useEffect } from "react";
import { CalendarCheck, Plus, Moon, Sun, Bookmark, Settings } from "lucide-react";
import AddEventPage from "@/pages/AddEvent";
import UpcomingPage from "@/pages/Upcoming";
import BookmarkletPage from "@/pages/Bookmarklet";
import SettingsPage from "@/pages/Settings";
import NotFound from "@/pages/not-found";

function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return (
    <button
      onClick={() => setDark(!dark)}
      className="p-2 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
      data-testid="theme-toggle"
      aria-label="Toggle theme"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function Header() {
  const [location] = useLocation();
  return (
    <header className="trinity-header text-white shadow-lg">
      <div className="max-w-5xl mx-auto px-4">
        {/* Top bar */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 32 32" width="28" height="28" aria-label="Trinity Staffing logo">
                <rect x="4" y="4" width="24" height="24" rx="4" fill="hsl(183 50% 94% / 0.15)" stroke="white" strokeWidth="1.5"/>
                <text x="16" y="22" textAnchor="middle" fontSize="16" fontWeight="700" fill="white" fontFamily="DM Sans, sans-serif">T</text>
              </svg>
              <div>
                <div className="text-sm font-semibold leading-tight">Trinity Staffing</div>
                <div className="text-xs text-white/60 leading-tight">Sales Mission</div>
              </div>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {/* Nav tabs */}
        <nav className="flex gap-1 -mb-px">
          <Link href="/">
            <a
              data-testid="nav-upcoming"
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors ${
                location === "/" || location === ""
                  ? "bg-background text-foreground"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              <CalendarCheck size={15} />
              Upcoming
            </a>
          </Link>
          <Link href="/add">
            <a
              data-testid="nav-add"
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors ${
                location === "/add"
                  ? "bg-background text-foreground"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              <Plus size={15} />
              Add Event
            </a>
          </Link>
          <Link href="/clipper">
            <a
              data-testid="nav-clipper"
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors ${
                location === "/clipper"
                  ? "bg-background text-foreground"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              <Bookmark size={15} />
              Clipper
            </a>
          </Link>
          <Link href="/settings">
            <a
              data-testid="nav-settings"
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors ${
                location === "/settings"
                  ? "bg-background text-foreground"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              <Settings size={15} />
              Settings
            </a>
          </Link>
        </nav>
      </div>
    </header>
  );
}

function AppShell() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        <Switch>
          <Route path="/" component={UpcomingPage} />
          <Route path="/add" component={AddEventPage} />
          <Route path="/clipper" component={BookmarkletPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <AppShell />
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}
