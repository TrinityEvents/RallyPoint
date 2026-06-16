import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { type Event, EVENT_TYPES, ATTENDING_OPTIONS } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  CalendarDays, MapPin, Link2, User, Clock, ExternalLink,
  Pencil, Trash2, Plus, Filter, CheckCircle2, XCircle, Clock3, RotateCcw,
  LayoutList, CalendarRange, ChevronLeft, ChevronRight
} from "lucide-react";

// ─── Utility ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00"); // avoid TZ shift
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T12:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function eventTypeBadgeClass(type: string) {
  const map: Record<string, string> = {
    "Chamber":          "badge-chamber",
    "Networking":        "badge-networking",
    "Job Fair":          "badge-job-fair",
    "Trade Show":        "badge-trade-show",
    "Client Visit":      "badge-client-visit",
    "Prospect Meeting":  "badge-prospect",
    "Other":             "badge-other",
  };
  return map[type] ?? "badge-other";
}

function attendingBadgeClass(attending: string) {
  const map: Record<string, string> = {
    "Ryan":      "badge-ryan",
    "Connie":    "badge-connie",
    "Both":      "badge-both",
    "Tentative": "badge-tentative",
  };
  return map[attending] ?? "badge-tentative";
}

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    "upcoming":  "status-upcoming",
    "attended":  "status-attended",
    "cancelled": "status-cancelled",
    "postponed": "status-postponed",
  };
  return map[status] ?? "status-upcoming";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "attended") return <CheckCircle2 size={12} className="text-green-600" />;
  if (status === "cancelled") return <XCircle size={12} className="text-red-500" />;
  if (status === "postponed") return <Clock3 size={12} className="text-amber-600" />;
  return null;
}

function SourceIcon({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    linkedin: "text-blue-600",
    email: "text-teal-600",
    chamber: "text-purple-600",
    website: "text-gray-500",
    manual: "text-gray-400",
  };
  const labels: Record<string, string> = {
    linkedin: "LinkedIn",
    email: "Email",
    chamber: "Chamber",
    website: "Web",
    manual: "Manual",
  };
  return (
    <span className={cn("text-xs font-medium", colors[platform] ?? "text-gray-400")}>
      {labels[platform] ?? platform}
    </span>
  );
}

// ─── Edit Modal ────────────────────────────────────────────────────────────

function EditModal({
  event,
  open,
  onClose,
}: {
  event: Event;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [notes, setNotes] = useState(event.notes ?? "");
  const [attending, setAttending] = useState(event.attending);
  const [status, setStatus] = useState(event.status);

  const ATTENDING_COLORS: Record<string, string> = {
    "Ryan":      "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-600",
    "Connie":    "border-pink-500 bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-600",
    "Both":      "border-cyan-400 bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-600",
    "Tentative": "border-yellow-400 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-600",
  };

  const updateMutation = useMutation({
    mutationFn: (data: { notes: string; attending: string; status: string }) =>
      apiRequest("PATCH", `/api/events/${event.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/upcoming"] });
      toast({ title: "Event updated" });
      onClose();
    },
    onError: () => toast({ title: "Error", description: "Could not update event.", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg" data-testid="edit-modal">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{event.title}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {formatDate(event.eventDate)} · {formatTime(event.startTime)} – {formatTime(event.endTime)}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Full details read view */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
            {event.location && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin size={12} /> <span>{event.location}</span>
              </div>
            )}
            {event.sourceUrl && (
              <div className="flex items-center gap-2">
                <Link2 size={12} className="text-muted-foreground" />
                <a
                  href={event.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline truncate max-w-[300px]"
                >
                  {event.sourceUrl}
                </a>
                <ExternalLink size={10} className="text-muted-foreground" />
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <User size={12} /> <span>Added by {event.addedBy}</span>
              <span className="mx-1">·</span>
              <SourceIcon platform={event.sourcePlatform} />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="select-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="attended">Attended</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="postponed">Postponed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Attending toggle */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Who's Attending</label>
            <div className="flex gap-2 flex-wrap">
              {ATTENDING_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setAttending(opt)}
                  data-testid={`attending-toggle-${opt.toLowerCase()}`}
                  className={cn(
                    "px-3 py-1.5 rounded-md border text-sm font-medium transition-all",
                    attending === opt
                      ? (ATTENDING_COLORS[opt] ?? "") + " ring-2 ring-offset-1 ring-primary/40"
                      : "border-border bg-background text-muted-foreground hover:border-primary/30"
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Opportunity context, contacts met, follow-up needed..."
              data-testid="edit-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="btn-cancel-edit">Cancel</Button>
          <Button
            onClick={() => updateMutation.mutate({ notes, attending, status })}
            disabled={updateMutation.isPending}
            data-testid="btn-save-edit"
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Event Card ────────────────────────────────────────────────────────────

function EventCard({ event }: { event: Event }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const days = daysUntil(event.eventDate);

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/events/${event.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/upcoming"] });
      toast({ title: "Event removed" });
    },
    onError: () => toast({ title: "Error", description: "Could not delete.", variant: "destructive" }),
  });

  return (
    <>
      <div
        data-testid={`event-card-${event.id}`}
        className={cn(
          "rounded-xl border shadow-sm hover:shadow-lg transition-all p-4",
          "bg-white dark:bg-slate-800/90",
          "border-slate-200 dark:border-slate-700",
          event.status === "cancelled" && "opacity-60",
          event.status === "attended" && "border-green-300 dark:border-green-800 bg-green-50/60 dark:bg-green-900/10"
        )}
      >
        {/* Top row: type badge + days chip + attending */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold", eventTypeBadgeClass(event.eventType))}>
              {event.eventType}
            </span>
            {event.status !== "upcoming" && (
              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", statusBadgeClass(event.status))}>
                <StatusIcon status={event.status} />
                {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {days === 0 && <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 px-2 py-0.5 rounded-full">Today</span>}
            {days === 1 && <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">Tomorrow</span>}
            {days > 1 && days <= 7 && <span className="text-xs text-muted-foreground">in {days}d</span>}
            {days < 0 && event.status === "upcoming" && <span className="text-xs text-muted-foreground italic">past</span>}
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", attendingBadgeClass(event.attending))}>
              {event.attending}
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-base leading-snug mb-1">{event.title}</h3>

        {/* Date + time */}
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <span className="flex items-center gap-1.5 bg-primary/10 dark:bg-primary/20 text-primary font-semibold text-sm px-2.5 py-1 rounded-lg">
            <CalendarDays size={13} />
            {formatDate(event.eventDate)}
          </span>
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock size={13} />
            {formatTime(event.startTime)} – {formatTime(event.endTime)}
          </span>
        </div>

        {/* Location */}
        {event.location && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
            <MapPin size={13} />
            <span>{event.location}</span>
          </div>
        )}

        {/* Notes preview */}
        {event.notes && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3 pl-0 border-l-2 border-muted pl-2">
            {event.notes}
          </p>
        )}

        {/* Footer: meta + actions */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <SourceIcon platform={event.sourcePlatform} />
            <span>·</span>
            <span>by {event.addedBy}</span>
            {event.sourceUrl && (
              <>
                <span>·</span>
                <a
                  href={event.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-0.5 text-primary hover:underline"
                  data-testid={`link-source-${event.id}`}
                >
                  <Link2 size={10} /> Source
                </a>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              data-testid={`btn-edit-${event.id}`}
              aria-label="Edit event"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => setConfirming(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              data-testid={`btn-delete-${event.id}`}
              aria-label="Delete event"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {editing && <EditModal event={event} open={editing} onClose={() => setEditing(false)} />}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this event?</AlertDialogTitle>
            <AlertDialogDescription>
              "{event.title}" will be permanently removed from the sales calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid={`confirm-delete-${event.id}`}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

type TypeFilter = "All" | typeof EVENT_TYPES[number];
type AttendeeFilter = "All" | "Ryan" | "Connie" | "Both";
type ViewMode = "upcoming" | "all";

type DisplayMode = "list" | "calendar";

// --- Calendar View Color Map ---
const EVENT_TYPE_COLORS: Record<string, string> = {
  "Chamber":          "#2563FF",
  "Networking":       "#8B5CF6",
  "Job Fair":         "#00D4FF",
  "Trade Show":       "#FF9F1C",
  "Client Visit":     "#FF5C7A",
  "Prospect Meeting": "#10b981",
  "Other":            "#64748B",
};

function CalendarView({ events }: { events: Event[] }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const monthName = new Date(year, month, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const byDate: Record<string, Event[]> = {};
  events.forEach(e => {
    if (!byDate[e.eventDate]) byDate[e.eventDate] = [];
    byDate[e.eventDate].push(e);
  });

  const cells: { day: number; currentMonth: boolean; dateStr: string }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    const mo = month === 0 ? 12 : month;
    const yr = month === 0 ? year - 1 : year;
    cells.push({ day: d, currentMonth: false, dateStr: `${yr}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}` });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, currentMonth: true, dateStr: `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}` });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const mo = month === 11 ? 1 : month + 2;
    const yr = month === 11 ? year + 1 : year;
    cells.push({ day: d, currentMonth: false, dateStr: `${yr}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}` });
  }

  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); }}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-muted-foreground transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{monthName}</span>
        <button
          onClick={() => { if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1); }}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-muted-foreground transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          const cellEvents = byDate[cell.dateStr] ?? [];
          const isToday = cell.dateStr === todayStr;
          return (
            <div
              key={idx}
              className={cn(
                "min-h-[80px] p-1.5 border-r border-b border-slate-100 dark:border-slate-700/50",
                !cell.currentMonth && "bg-slate-50/50 dark:bg-slate-900/30",
                isToday && "bg-primary/5 dark:bg-primary/10"
              )}
            >
              <div className={cn(
                "text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full",
                isToday ? "bg-primary text-white" : cell.currentMonth ? "text-slate-700 dark:text-slate-300" : "text-slate-300 dark:text-slate-600"
              )}>
                {cell.day}
              </div>
              <div className="flex flex-col gap-0.5">
                {cellEvents.slice(0, 3).map(e => (
                  <div
                    key={e.id}
                    title={e.title}
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded truncate text-white leading-tight"
                    style={{ backgroundColor: EVENT_TYPE_COLORS[e.eventType] ?? "#64748B" }}
                  >
                    {e.title}
                  </div>
                ))}
                {cellEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground pl-1">+{cellEvents.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function UpcomingPage() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("All");
  const [attendeeFilter, setAttendeeFilter] = useState<AttendeeFilter>("All");
  const [viewMode, setViewMode] = useState<ViewMode>("upcoming");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("list");

  const { data: upcoming, isLoading: loadingUpcoming } = useQuery<Event[]>({
    queryKey: ["/api/events/upcoming"],
  });
  const { data: all, isLoading: loadingAll } = useQuery<Event[]>({
    queryKey: ["/api/events"],
    enabled: viewMode === "all",
  });

  const events = viewMode === "upcoming" ? (upcoming ?? []) : (all ?? []);
  const isLoading = viewMode === "upcoming" ? loadingUpcoming : loadingAll;

  const filtered = events.filter((e) => {
    if (typeFilter !== "All" && e.eventType !== typeFilter) return false;
    if (attendeeFilter !== "All") {
      if (attendeeFilter === "Both") {
        if (e.attending !== "Both") return false;
      } else {
        if (e.attending !== attendeeFilter && e.attending !== "Both") return false;
      }
    }
    return true;
  });

  const stats = {
    total: events.length,
    ryan: events.filter(e => e.attending === "Ryan" || e.attending === "Both").length,
    connie: events.filter(e => e.attending === "Connie" || e.attending === "Both").length,
    attended: events.filter(e => e.status === "attended").length,
  };

  return (
    <div>
      {/* Stats strip */}
      {events.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: viewMode === "upcoming" ? "Upcoming" : "Total", value: stats.total, color: "text-primary" },
            { label: "Ryan", value: stats.ryan, color: "text-blue-500" },
            { label: "Connie", value: stats.connie, color: "text-pink-500" },
            { label: "Attended", value: stats.attended, color: "text-cyan-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border bg-card p-3 text-center shadow-sm">
              <div className={cn("text-xl font-bold", color)}>{value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-col gap-3 mb-4">
        {/* View mode tabs */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => setViewMode("upcoming")}
              data-testid="view-upcoming"
              className={cn(
                "px-3 py-1.5 text-sm rounded-md font-medium transition-colors",
                viewMode === "upcoming" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Upcoming
            </button>
            <button
              onClick={() => setViewMode("all")}
              data-testid="view-all"
              className={cn(
                "px-3 py-1.5 text-sm rounded-md font-medium transition-colors",
                viewMode === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              All Events
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* List / Calendar display toggle */}
            <div className="flex gap-0.5 bg-muted rounded-lg p-1">
              <button
                onClick={() => setDisplayMode("list")}
                data-testid="display-list"
                title="List view"
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  displayMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutList size={15} />
              </button>
              <button
                onClick={() => setDisplayMode("calendar")}
                data-testid="display-calendar"
                title="Calendar view"
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  displayMode === "calendar" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <CalendarRange size={15} />
              </button>
            </div>
            <Link href="/add">
              <a>
                <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground" data-testid="btn-add-event-shortcut">
                  <Plus size={14} /> Add Event
                </Button>
              </a>
            </Link>
          </div>
        </div>

        {/* Type filters */}
        <div className="flex flex-wrap gap-1.5">
          {(["All", ...EVENT_TYPES] as TypeFilter[]).map((t) => {
            const TYPE_COLORS: Record<string, { active: string; inactive: string }> = {
              "All":              { active: "bg-primary text-white border-primary",                                                                inactive: "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground" },
              "Chamber":          { active: "bg-[#2563FF] text-white border-[#2563FF]",                                                           inactive: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-100" },
              "Networking":       { active: "bg-[#8B5CF6] text-white border-[#8B5CF6]",                                                           inactive: "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800 hover:bg-purple-100" },
              "Job Fair":         { active: "bg-[#00D4FF] text-slate-900 border-[#00D4FF]",                                                       inactive: "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800 hover:bg-cyan-100" },
              "Trade Show":       { active: "bg-[#FF9F1C] text-white border-[#FF9F1C]",                                                           inactive: "bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800 hover:bg-orange-100" },
              "Client Visit":     { active: "bg-[#FF5C7A] text-white border-[#FF5C7A]",                                                           inactive: "bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 border-pink-200 dark:border-pink-800 hover:bg-pink-100" },
              "Prospect Meeting": { active: "bg-[#10b981] text-white border-[#10b981]",                                                           inactive: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100" },
              "Other":            { active: "bg-slate-500 text-white border-slate-500",                                                            inactive: "bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100" },
            };
            const colors = TYPE_COLORS[t] ?? TYPE_COLORS["Other"];
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                data-testid={`filter-type-${t.toLowerCase().replace(/\s/g, "-")}`}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-full border font-medium transition-all",
                  typeFilter === t ? colors.active : colors.inactive
                )}
              >
                {t}
              </button>
            );
          })}
        </div>

        {/* Attendee filters */}
        <div className="flex gap-1.5">
          {(["All", "Ryan", "Connie", "Both"] as AttendeeFilter[]).map((a) => (
            <button
              key={a}
              onClick={() => setAttendeeFilter(a)}
              data-testid={`filter-attendee-${a.toLowerCase()}`}
              className={cn(
                "px-2.5 py-1 text-xs rounded-full border font-medium transition-colors",
                attendeeFilter === a
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
              )}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar or List */}
      {displayMode === "calendar" ? (
        <CalendarView events={filtered} />
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <CalendarDays size={40} className="mx-auto mb-3 opacity-25" />
          <p className="font-medium">No events yet</p>
          <p className="text-sm mt-1">
            {typeFilter !== "All" || attendeeFilter !== "All"
              ? "Try clearing the filters"
              : "Add your first sales event to get started"}
          </p>
          {typeFilter === "All" && attendeeFilter === "All" && (
            <Link href="/add">
              <a>
                <Button className="mt-4 gap-2 bg-primary text-primary-foreground" data-testid="btn-add-first">
                  <Plus size={14} /> Add Event
                </Button>
              </a>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
          <p className="text-xs text-center text-muted-foreground pt-2">
            {filtered.length} event{filtered.length !== 1 ? "s" : ""}
            {(typeFilter !== "All" || attendeeFilter !== "All") && " (filtered)"}
          </p>
        </div>
      )}
    </div>
  );
}

