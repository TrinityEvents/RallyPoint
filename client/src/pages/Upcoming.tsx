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
  LayoutList, Calendar
} from "lucide-react";

// ─── Utility ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
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

// Color map for event types — used in both list badges and calendar dots
export const EVENT_TYPE_COLORS: Record<string, { badge: string; dot: string; cal: string }> = {
  "Chamber":          { badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",         dot: "bg-blue-500",    cal: "bg-blue-500/20 border-blue-400 text-blue-800 dark:text-blue-200" },
  "Networking":       { badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300", dot: "bg-purple-500",  cal: "bg-purple-500/20 border-purple-400 text-purple-800 dark:text-purple-200" },
  "Job Fair":         { badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",         dot: "bg-cyan-500",    cal: "bg-cyan-500/20 border-cyan-400 text-cyan-800 dark:text-cyan-200" },
  "Trade Show":       { badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", dot: "bg-orange-500",  cal: "bg-orange-500/20 border-orange-400 text-orange-800 dark:text-orange-200" },
  "Client Visit":     { badge: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",         dot: "bg-pink-500",    cal: "bg-pink-500/20 border-pink-400 text-pink-800 dark:text-pink-200" },
  "Prospect Meeting": { badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-500", cal: "bg-emerald-500/20 border-emerald-400 text-emerald-800 dark:text-emerald-200" },
  "Other":            { badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",        dot: "bg-slate-400",   cal: "bg-slate-500/20 border-slate-400 text-slate-700 dark:text-slate-300" },
};

function eventTypeBadgeClass(type: string) {
  return EVENT_TYPE_COLORS[type]?.badge ?? EVENT_TYPE_COLORS["Other"].badge;
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

// ─── Calendar View ──────────────────────────────────────────────────────────

function CalendarView({ events }: { events: Event[] }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = new Date(year, month).toLocaleString("en-US", { month: "long", year: "numeric" });

  // Map date string -> events
  const byDate: Record<string, Event[]> = {};
  events.forEach(e => {
    if (!byDate[e.eventDate]) byDate[e.eventDate] = [];
    byDate[e.eventDate].push(e);
  });

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const todayStr = today.toISOString().split("T")[0];

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Calendar header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" aria-label="Previous month">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <span className="font-semibold text-sm">{monthName}</span>
        <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" aria-label="Next month">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-border/40 last:border-r-0" />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEvents = byDate[dateStr] ?? [];
          const isToday = dateStr === todayStr;
          const isPast = dateStr < todayStr;

          return (
            <div
              key={dateStr}
              className={cn(
                "min-h-[80px] p-1 border-b border-r border-border/40 last:border-r-0 transition-colors",
                isPast && "bg-muted/20",
                isToday && "bg-primary/5 ring-1 ring-inset ring-primary/30"
              )}
            >
              <div className={cn(
                "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1",
                isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              )}>
                {day}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(ev => (
                  <button
                    key={ev.id}
                    onClick={() => setSelectedEvent(ev)}
                    data-testid={`cal-event-${ev.id}`}
                    className={cn(
                      "w-full text-left text-[10px] font-medium px-1 py-0.5 rounded truncate border",
                      EVENT_TYPE_COLORS[ev.eventType]?.cal ?? EVENT_TYPE_COLORS["Other"].cal,
                      ev.status === "cancelled" && "opacity-40 line-through"
                    )}
                  >
                    {ev.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-3 border-t bg-muted/20">
        {Object.entries(EVENT_TYPE_COLORS).map(([type, { dot }]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className={cn("w-2 h-2 rounded-full", dot)} />
            <span className="text-[11px] text-muted-foreground">{type}</span>
          </div>
        ))}
      </div>

      {/* Event detail popover */}
      {selectedEvent && (
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold", eventTypeBadgeClass(selectedEvent.eventType))}>
                  {selectedEvent.eventType}
                </span>
              </div>
              <DialogTitle className="text-base">{selectedEvent.title}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {formatDate(selectedEvent.eventDate)} · {formatTime(selectedEvent.startTime)} – {formatTime(selectedEvent.endTime)}
              </p>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              {selectedEvent.location && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin size={13} /> {selectedEvent.location}
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <User size={13} /> Attending: <span className="text-foreground font-medium">{selectedEvent.attending}</span>
              </div>
              {selectedEvent.notes && (
                <p className="text-muted-foreground border-l-2 border-muted pl-2">{selectedEvent.notes}</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Edit Modal ────────────────────────────────────────────────────────────

function EditModal({ event, open, onClose }: { event: Event; open: boolean; onClose: () => void }) {
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
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
            {event.location && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin size={12} /> <span>{event.location}</span>
              </div>
            )}
            {event.sourceUrl && (
              <div className="flex items-center gap-2">
                <Link2 size={12} className="text-muted-foreground" />
                <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[300px]">
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
          "rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow p-4",
          event.status === "cancelled" && "opacity-60",
          event.status === "attended" && "border-green-200 dark:border-green-900"
        )}
      >
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
        <h3 className="font-semibold text-foreground text-base leading-snug mb-1">{event.title}</h3>
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
          <span className="flex items-center gap-1.5"><CalendarDays size={13} />{formatDate(event.eventDate)}</span>
          <span className="flex items-center gap-1.5"><Clock size={13} />{formatTime(event.startTime)} – {formatTime(event.endTime)}</span>
        </div>
        {event.location && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
            <MapPin size={13} /><span>{event.location}</span>
          </div>
        )}
        {event.notes && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3 border-l-2 border-muted pl-2">{event.notes}</p>
        )}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <SourceIcon platform={event.sourcePlatform} />
            <span>·</span>
            <span>by {event.addedBy}</span>
            {event.sourceUrl && (
              <>
                <span>·</span>
                <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-primary hover:underline" data-testid={`link-source-${event.id}`}>
                  <Link2 size={10} /> Source
                </a>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setEditing(true)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" data-testid={`btn-edit-${event.id}`} aria-label="Edit event">
              <Pencil size={13} />
            </button>
            <button onClick={() => setConfirming(true)} className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" data-testid={`btn-delete-${event.id}`} aria-label="Delete event">
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
            <AlertDialogDescription>"{event.title}" will be permanently removed from the sales calendar.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid={`confirm-delete-${event.id}`}>
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
    enabled: viewMode === "all" || displayMode === "calendar",
  });

  // Calendar always shows all events
  const events = displayMode === "calendar"
    ? (all ?? [])
    : (viewMode === "upcoming" ? (upcoming ?? []) : (all ?? []));
  const isLoading = displayMode === "calendar" ? loadingAll : (viewMode === "upcoming" ? loadingUpcoming : loadingAll);

  const filtered = events.filter((e) => {
    if (typeFilter !== "All" && e.eventType !== typeFilter) return false;
    if (attendeeFilter !== "All") {
      if (attendeeFilter === "Both") { if (e.attending !== "Both") return false; }
      else { if (e.attending !== attendeeFilter && e.attending !== "Both") return false; }
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

      {/* Toolbar */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between gap-2">
          {/* Upcoming / All tabs — hidden in calendar mode */}
          {displayMode === "list" && (
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              <button onClick={() => setViewMode("upcoming")} data-testid="view-upcoming" className={cn("px-3 py-1.5 text-sm rounded-md font-medium transition-colors", viewMode === "upcoming" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                Upcoming
              </button>
              <button onClick={() => setViewMode("all")} data-testid="view-all" className={cn("px-3 py-1.5 text-sm rounded-md font-medium transition-colors", viewMode === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                All Events
              </button>
            </div>
          )}
          {displayMode === "calendar" && <div className="flex-1" />}

          <div className="flex items-center gap-2">
            {/* List / Calendar toggle */}
            <div className="flex gap-0.5 bg-muted rounded-lg p-1">
              <button
                onClick={() => setDisplayMode("list")}
                data-testid="display-list"
                className={cn("p-1.5 rounded-md transition-colors", displayMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                aria-label="List view"
              >
                <LayoutList size={15} />
              </button>
              <button
                onClick={() => setDisplayMode("calendar")}
                data-testid="display-calendar"
                className={cn("p-1.5 rounded-md transition-colors", displayMode === "calendar" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                aria-label="Calendar view"
              >
                <Calendar size={15} />
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

        {/* Filters — shown in both modes */}
        <div className="flex flex-wrap gap-1.5">
          {(["All", ...EVENT_TYPES] as TypeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              data-testid={`filter-type-${t.toLowerCase().replace(/\s/g, "-")}`}
              className={cn(
                "px-2.5 py-1 text-xs rounded-full border font-medium transition-colors",
                typeFilter === t ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5">
          {(["All", "Ryan", "Connie", "Both"] as AttendeeFilter[]).map((a) => (
            <button
              key={a}
              onClick={() => setAttendeeFilter(a)}
              data-testid={`filter-attendee-${a.toLowerCase()}`}
              className={cn(
                "px-2.5 py-1 text-xs rounded-full border font-medium transition-colors",
                attendeeFilter === a ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
              )}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
        </div>
      ) : displayMode === "calendar" ? (
        <CalendarView events={filtered} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <CalendarDays size={40} className="mx-auto mb-3 opacity-25" />
          <p className="font-medium">No events yet</p>
          <p className="text-sm mt-1">
            {typeFilter !== "All" || attendeeFilter !== "All" ? "Try clearing the filters" : "Add your first sales event to get started"}
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
          {filtered.map((event) => <EventCard key={event.id} event={event} />)}
          <p className="text-xs text-center text-muted-foreground pt-2">
            {filtered.length} event{filtered.length !== 1 ? "s" : ""}
            {(typeFilter !== "All" || attendeeFilter !== "All") && " (filtered)"}
          </p>
        </div>
      )}
    </div>
  );
}
