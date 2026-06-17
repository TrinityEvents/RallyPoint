import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import {
  Users, CalendarCheck, UserCheck, AlertCircle,
  TrendingUp, ChevronRight, CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ──────────────────────────────────────────────────────────────────

interface RepSummary {
  userName: string;
  eventsPlanned: number;
  eventsAttended: number;
  contactsCaptured: number;
  followUpTotal: number;
  followUpDone: number;
  crmExports: number;
}

interface RepEvent {
  id: number;
  title: string;
  eventDate: string;
  eventType: string;
  status: string;
  contactCount: number;
}

interface RepDetail {
  events: RepEvent[];
  followUps: FollowUp[];
  exports: { id: number; exportType: string; contactCount: number; exportedAt: string }[];
}

interface FollowUp {
  id: number;
  contactId: number;
  assignedTo: string;
  dueDate: string;
  status: string;
  completedAt: string | null;
  note: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function activityScore(rep: RepSummary): number {
  const eventScore   = rep.eventsPlanned > 0
    ? Math.min((rep.eventsAttended / rep.eventsPlanned) * 100, 100)
    : 0;
  const contactScore = Math.min((rep.contactsCaptured / 20) * 100, 100);
  const fuScore      = rep.followUpTotal > 0
    ? (rep.followUpDone / rep.followUpTotal) * 100
    : rep.contactsCaptured > 0 ? 0 : 50; // neutral if no contacts yet
  return Math.round(eventScore * 0.40 + contactScore * 0.35 + fuScore * 0.25);
}

function scoreBand(score: number): { label: string; color: string; bg: string } {
  if (score >= 75) return { label: "Hot",  color: "#10b981", bg: "rgba(16,185,129,.12)" };
  if (score >= 50) return { label: "Warm", color: "#f59e0b", bg: "rgba(245,158,11,.12)" };
  return              { label: "Cold", color: "#ef4444",  bg: "rgba(239,68,68,.12)" };
}

function initials(name: string) {
  return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
}

function avatarColor(name: string) {
  const palette = ["#2563FF", "#10b981", "#f59e0b", "#8B5CF6", "#FF5C7A", "#00D4FF"];
  let h = 0;
  for (const c of name) h = h * 31 + c.charCodeAt(0);
  return palette[Math.abs(h) % palette.length];
}

function formatDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDue(dateStr: string): { label: string; overdue: boolean } {
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(dateStr + "T00:00:00");
  const diff  = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0)   return { label: `${Math.abs(diff)}d overdue`, overdue: true };
  if (diff === 0) return { label: "Due today", overdue: false };
  if (diff === 1) return { label: "Due tomorrow", overdue: false };
  return { label: `Due in ${diff}d`, overdue: false };
}

const TYPE_COLORS: Record<string, string> = {
  chamber: "#2563FF", networking: "#10b981", "job fair": "#f59e0b",
  "trade show": "#8B5CF6", "client visit": "#00D4FF", "prospect meeting": "#FF5C7A",
  other: "#6b7280",
};
function typeColor(t: string) { return TYPE_COLORS[t.toLowerCase()] ?? "#6b7280"; }

// ── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, warn }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; warn?: boolean;
}) {
  return (
    <div className={`flex-1 min-w-[120px] snap-start rounded-xl border ${warn ? "border-red-500/30 bg-red-500/5" : "border-border bg-card"} p-4 flex flex-col gap-1`}>
      <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${warn ? "text-red-400" : "text-muted-foreground"}`}>
        {icon} {label}
      </div>
      <span className={`text-2xl font-bold leading-tight ${warn ? "text-red-400" : "text-foreground"}`}>{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    attended:  { label: "Attended",  color: "#10b981" },
    upcoming:  { label: "Upcoming",  color: "#2563FF" },
    cancelled: { label: "Cancelled", color: "#6b7280" },
    postponed: { label: "Postponed", color: "#f59e0b" },
  };
  const s = map[status] ?? map.upcoming;
  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{ color: s.color, background: s.color + "22" }}
    >
      {s.label}
    </span>
  );
}

// ── Rep detail ───────────────────────────────────────────────────────────────

function RepDetailView({ rep, onBack, onMarkDone }: {
  rep: RepSummary;
  onBack: () => void;
  onMarkDone: (id: number) => void;
}) {
  const { data: detail, isLoading } = useQuery<RepDetail>({
    queryKey: ["/api/accountability/rep", rep.userName],
    queryFn: () => apiRequest("GET", `/api/accountability/rep/${encodeURIComponent(rep.userName)}`).then(r => r.json()),
  });

  const score = activityScore(rep);
  const band  = scoreBand(score);
  const followPct = rep.followUpTotal > 0
    ? Math.round((rep.followUpDone / rep.followUpTotal) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Back */}
      <button
        data-testid="btn-back-team"
        onClick={onBack}
        className="text-sm text-primary font-medium flex items-center gap-1"
      >
        ← Team Activity
      </button>

      {/* Hero */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ background: avatarColor(rep.userName) }}
          >
            {initials(rep.userName)}
          </div>
          <div>
            <div className="font-bold text-foreground">{rep.userName}</div>
            <div
              className="text-xs font-semibold rounded-full px-2 py-0.5 inline-block mt-0.5"
              style={{ color: band.color, background: band.bg }}
            >
              Score {score} · {band.label}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Events Attended",   val: `${rep.eventsAttended} / ${rep.eventsPlanned}` },
            { label: "Contacts Captured", val: rep.contactsCaptured },
            { label: "Follow-ups",        val: `${rep.followUpDone} / ${rep.followUpTotal || "—"}` },
            { label: "CRM Exports",       val: rep.crmExports || "—" },
          ].map(({ label, val }) => (
            <div key={label} className="rounded-lg bg-muted/40 p-3">
              <div className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">{label}</div>
              <div className="font-bold text-foreground text-sm">{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Events this rep was part of */}
      <div>
        <h3 className="font-semibold text-sm text-foreground mb-2">Events</h3>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : !detail?.events?.length ? (
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground text-center">
            No events logged yet
          </div>
        ) : (
          <div className="space-y-2">
            {detail.events.map(ev => (
              <div
                key={ev.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
              >
                <div
                  className="w-1.5 h-8 rounded-full shrink-0"
                  style={{ background: typeColor(ev.eventType) }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{ev.title}</div>
                  <div className="text-[10px] text-muted-foreground">{formatDate(ev.eventDate)} · {ev.eventType}</div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StatusPill status={ev.status} />
                  {ev.contactCount > 0 && (
                    <span className="text-[10px] text-muted-foreground">{ev.contactCount} contacts</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Follow-up queue */}
      {detail?.followUps && detail.followUps.filter(f => f.status !== "done").length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm text-foreground">Open Follow-ups</h3>
            <span className="text-xs text-muted-foreground">
              {detail.followUps.filter(f => f.status !== "done").length} pending
            </span>
          </div>
          <div className="space-y-2">
            {detail.followUps
              .filter(f => f.status !== "done")
              .map(fu => {
                const due = formatDue(fu.dueDate);
                return (
                  <div
                    key={fu.id}
                    data-testid={`followup-${fu.id}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                  >
                    <button
                      data-testid={`btn-done-${fu.id}`}
                      onClick={() => onMarkDone(fu.id)}
                      className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 hover:border-primary transition-colors shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      {fu.note
                        ? <div className="text-sm text-foreground truncate">{fu.note}</div>
                        : <div className="text-sm text-muted-foreground">Contact #{fu.contactId}</div>
                      }
                    </div>
                    <span className={`text-xs font-medium shrink-0 ${due.overdue ? "text-red-500" : "text-muted-foreground"}`}>
                      {due.label}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Rep card ─────────────────────────────────────────────────────────────────

function RepCard({ rep, onSelect }: { rep: RepSummary; onSelect: () => void }) {
  const score = activityScore(rep);
  const band  = scoreBand(score);
  const followPct = rep.followUpTotal > 0
    ? Math.round((rep.followUpDone / rep.followUpTotal) * 100) : 0;
  const attendPct = rep.eventsPlanned > 0
    ? Math.round((rep.eventsAttended / rep.eventsPlanned) * 100) : 0;

  return (
    <button
      data-testid={`rep-card-${rep.userName.replace(" ", "-")}`}
      onClick={onSelect}
      className="w-full text-left rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors active:scale-[.99]"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ background: avatarColor(rep.userName) }}
        >
          {initials(rep.userName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-foreground truncate">{rep.userName}</div>
          <div
            className="text-xs font-semibold rounded-full px-2 py-0.5 inline-block mt-0.5"
            style={{ color: band.color, background: band.bg }}
          >
            {score} · {band.label}
          </div>
        </div>
        <ChevronRight size={15} className="text-muted-foreground shrink-0" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center">
          <div className="text-base font-bold text-foreground">{rep.eventsAttended}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Events</div>
        </div>
        <div className="text-center">
          <div className="text-base font-bold text-foreground">{rep.contactsCaptured}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Contacts</div>
        </div>
        <div className="text-center">
          <div className="text-base font-bold text-foreground">{followPct > 0 ? `${followPct}%` : "—"}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Follow-up</div>
        </div>
      </div>

      {/* Attendance bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Event attendance</span>
          <span>{rep.eventsAttended}/{rep.eventsPlanned}</span>
        </div>
        <Progress value={attendPct} className="h-1.5" />
      </div>
    </button>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-3">
      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
        <TrendingUp size={24} className="text-primary" />
      </div>
      <p className="font-semibold text-foreground">No activity yet</p>
      <p className="text-sm text-muted-foreground max-w-xs">
        Add events and assign them to reps — activity scores will calculate automatically.
      </p>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AccountabilityPage() {
  const [selectedRep, setSelectedRep] = useState<RepSummary | null>(null);

  const { data: team = [], isLoading } = useQuery<RepSummary[]>({
    queryKey: ["/api/accountability/team"],
  });

  const markDone = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/follow-ups/${id}`, {
        status: "done",
        completedAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accountability/team"] });
    },
  });

  // Totals
  const totals = team.reduce(
    (acc, r) => ({
      events:   acc.events   + r.eventsAttended,
      contacts: acc.contacts + r.contactsCaptured,
      fuTotal:  acc.fuTotal  + r.followUpTotal,
      fuDone:   acc.fuDone   + r.followUpDone,
    }),
    { events: 0, contacts: 0, fuTotal: 0, fuDone: 0 }
  );

  const teamFollowPct = totals.fuTotal > 0
    ? Math.round((totals.fuDone / totals.fuTotal) * 100) : 0;

  // Loading
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-40 rounded" />
        <div className="flex gap-3 overflow-x-auto pb-1">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 flex-1 min-w-[120px] rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      </div>
    );
  }

  // Rep detail drill-in
  if (selectedRep) {
    return (
      <RepDetailView
        rep={selectedRep}
        onBack={() => setSelectedRep(null)}
        onMarkDone={(id) => markDone.mutate(id)}
      />
    );
  }

  if (team.length === 0) return <EmptyState />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Team Activity</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Activity tracking — not outcomes</p>
      </div>

      {/* KPI strip */}
      <div className="flex gap-3 overflow-x-auto pb-1 snap-x -mx-1 px-1">
        <KpiCard
          icon={<CalendarCheck size={12} />}
          label="Events"
          value={totals.events}
          sub={`${team.length} reps tracked`}
        />
        <KpiCard
          icon={<Users size={12} />}
          label="Contacts"
          value={totals.contacts}
        />
        {totals.fuTotal > 0 && (
          <KpiCard
            icon={<UserCheck size={12} />}
            label="Follow-up"
            value={`${teamFollowPct}%`}
            sub={`${totals.fuDone}/${totals.fuTotal}`}
          />
        )}
      </div>

      {/* Rep grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm text-foreground">Reps</h2>
          <span className="text-xs text-muted-foreground">Tap to drill in</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...team]
            .sort((a, b) => activityScore(b) - activityScore(a))
            .map(rep => (
              <RepCard
                key={rep.userName}
                rep={rep}
                onSelect={() => setSelectedRep(rep)}
              />
            ))}
        </div>
      </div>

      {/* Score key — compact */}
      <div className="rounded-xl border border-border bg-card/40 px-4 py-3">
        <div className="flex items-center justify-around gap-4">
          {[
            { band: "Hot",  range: "75–100", color: "#10b981" },
            { band: "Warm", range: "50–74",  color: "#f59e0b" },
            { band: "Cold", range: "0–49",   color: "#ef4444" },
          ].map(({ band, range, color }) => (
            <div key={band} className="text-center">
              <div className="text-sm font-bold" style={{ color }}>{band}</div>
              <div className="text-[10px] text-muted-foreground">{range}</div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          Attendance · contacts · follow-ups — not revenue
        </p>
      </div>
    </div>
  );
}
