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
      className="p-2 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
      data-testid="theme-toggle"
      aria-label="Toggle theme"
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}

// RallyPoint logo SVG — starburst mark + wordmark
function RallyPointLogo() {
  return (
    <div className="flex items-center gap-3">
      {/* Starburst mark — larger */}
      <svg width="42" height="42" viewBox="0 0 32 32" fill="none" aria-label="RallyPoint logo mark">
        <rect width="32" height="32" rx="8" fill="#0B132B"/>
        <circle cx="16" cy="16" r="2.5" fill="#2563FF"/>
        <circle cx="16" cy="7" r="2" fill="#00D4FF"/>
        <line x1="16" y1="9" x2="16" y2="13.5" stroke="#2563FF" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="23.5" cy="10.5" r="2" fill="#FF9F1C"/>
        <line x1="21.9" y1="11.9" x2="18" y2="14.8" stroke="#FF9F1C" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="23.5" cy="21.5" r="2" fill="#FF5C7A"/>
        <line x1="21.9" y1="20.1" x2="18" y2="17.2" stroke="#FF5C7A" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="16" cy="25" r="2" fill="#8B5CF6"/>
        <line x1="16" y1="23" x2="16" y2="18.5" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="8.5" cy="21.5" r="2" fill="#FFD60A"/>
        <line x1="10.1" y1="20.1" x2="14" y2="17.2" stroke="#FFD60A" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="8.5" cy="10.5" r="2" fill="#00D4FF"/>
        <line x1="10.1" y1="11.9" x2="14" y2="14.8" stroke="#00D4FF" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      {/* Wordmark — larger */}
      <div className="flex items-baseline gap-0">
        <span className="text-white font-bold text-[24px] tracking-tight leading-none">Rally</span>
        <span className="font-bold text-[24px] tracking-tight leading-none" style={{color:"#00D4FF"}}>Point</span>
        <svg width="10" height="10" viewBox="0 0 8 8" className="ml-0.5 mb-1.5" style={{color:"#FFD60A"}}>
          <path d="M4 0 L4.8 3.2 L8 4 L4.8 4.8 L4 8 L3.2 4.8 L0 4 L3.2 3.2 Z" fill="currentColor"/>
        </svg>
      </div>
    </div>
  );
}

function Header() {
  const [location] = useLocation();

  const navItem = (path: string, label: string, icon: React.ReactNode, match?: string) => {
    const active = match ? location === match : location === path;
    return (
      <Link href={path}>
        <a
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors ${
            active
              ? "bg-background text-foreground"
              : "text-white/55 hover:text-white hover:bg-white/8"
          }`}
        >
          {icon}
          {label}
        </a>
      </Link>
    );
  };

  return (
    <header className="rallypoint-header text-white shadow-xl">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between py-3">
          <RallyPointLogo />
          <div className="flex items-center gap-1">
            <span className="text-white/25 text-xs font-medium tracking-widest uppercase mr-2 hidden sm:block">Sales Mission</span>
            <ThemeToggle />
          </div>
        </div>
        <nav className="flex gap-0.5 -mb-px">
          {navItem("/",        "Upcoming",  <CalendarCheck size={14} />, "/")}
          {navItem("/add",     "Add Event", <Plus size={14} />)}
          {navItem("/clipper", "Clipper",   <Bookmark size={14} />)}
          {navItem("/settings","Settings",  <Settings size={14} />)}
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
