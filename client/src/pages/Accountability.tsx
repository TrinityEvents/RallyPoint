import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import { Users, CalendarCheck, UserCheck, AlertCircle, TrendingUp, ChevronRight, CheckCircle2, Clock, ArrowUpRight } from "lucide-react";
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
  // Benchmark caps (normalize each metric 0–100)
  const eventScore    = Math.min((rep.eventsAttended / Math.max(rep.eventsPlanned, 1)) * 100, 100);
  const contactScore  = Math.min((rep.contactsCaptured / 20) * 100, 100); // 20 contacts/period = 100%
  const followUpScore = rep.followUpTotal > 0
    ? (rep.followUpDone / rep.followUpTotal) * 100
    : 0;
  return Math.round(eventScore * 0.40 + contactScore * 0.35 + followUpScore * 0.25);
}

function scoreBand(score: number): { label: string; color: string; bg: string } {
  if (score >= 75) return { label: "Hot",  color: "#10b981", bg: "rgba(16,185,129,.12)" };
  if (score >= 50) return { label: "Warm", color: "#f59e0b", bg: "rgba(245,158,11,.12)" };
  return              { label: "Cold", color: "#ef4444", bg: "rgba(239,68,68,.12)" };
}

function initials(name: string) {
  return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
}

function avatarColor(name: string) {
  const colors = ["#2563FF", "#10b981", "#f59e0b", "#8B5CF6", "#FF5C7A", "#00D4FF"];
  let hash = 0;
  for (const c of name) hash = hash * 31 + c.charCodeAt(0);
  return colors[Math.abs(hash) % colors.length];
}

function formatDue(dateStr: string): { label: string; overdue: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, overdue: true };
  if (diff === 0) return { label: "Due today", overdue: false };
  if (diff === 1) return { label: "Due tomorrow", overdue: false };
  return { label: `Due in ${diff}d`, overdue: false };
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
        <TrendingUp size={24} className="text-primary" />
      </div>
      <p className="font-semibold text-foreground">No activity yet</p>
      <p className="text-sm text-muted-foreground max-w-xs">
        Attendance and follow-up data will appear here once your team starts logging activity.
      </p>
    </div>
  );
}

// ── KPI strip ────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string;
}) {
  return (
    <div className="flex-1 min-w-[130px] rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <span className="text-2xl font-bold text-foreground leading-tight">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ── Rep card ─────────────────────────────────────────────────────────────────

function RepCard({ rep, onSelect }: { rep: RepSummary; onSelect: () => void }) {
  const score = activityScore(rep);
  const band  = scoreBand(score);
  const followPct = rep.followUpTotal > 0
    ? Math.round((rep.followUpDone / rep.followUpTotal) * 100)
    : 0;

  return (
    <button
      data-testid={`rep-card-${rep.userName.replace(" ", "-")}`}
      onClick={onSelect}
      className="w-full text-left rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors active:scale-[.99]"
    >
      {/* Header row */}
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
        <ChevronRight size={16} className="text-muted-foreground shrink-0" />
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center">
          <div className="text-lg font-bold text-foreground">{rep.eventsAttended}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Events</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-foreground">{rep.contactsCaptured}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Contacts</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-foreground">{followPct}%</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Follow-up</div>
        </div>
      </div>

      {/* Follow-up progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Follow-up rate</span>
          <span>{rep.followUpDone}/{rep.followUpTotal}</span>
        </div>
        <Progress
          value={followPct}
          className="h-1.5"
        />
      </div>
    </button>
  );
}

// ── Rep detail drawer (mobile sheet pattern) ─────────────────────────────────

function RepDetail({ rep, followUps, onBack, onMarkDone }: {
  rep: RepSummary;
  followUps: FollowUp[];
  onBack: () => void;
  onMarkDone: (id: number) => void;
}) {
  const myFollowUps = followUps.filter(f => f.assignedTo === rep.userName);
  const pending = myFollowUps.filter(f => f.status !== "done");
  const score = activityScore(rep);
  const band  = scoreBand(score);

  return (
    <div className="space-y-5">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button
          data-testid="btn-back-team"
          onClick={onBack}
          className="text-sm text-primary font-medium flex items-center gap-1"
        >
          ← Team
        </button>
      </div>

      {/* Rep hero card */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
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
              Activity Score: {score} — {band.label}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Events Attended",   val: `${rep.eventsAttended} / ${rep.eventsPlanned}` },
            { label: "Contacts Captured", val: rep.contactsCaptured },
            { label: "Follow-ups Done",   val: `${rep.followUpDone} / ${rep.followUpTotal}` },
            { label: "CRM Exports",       val: rep.crmExports },
          ].map(({ label, val }) => (
            <div key={label} className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
              <div className="font-bold text-foreground">{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Follow-up queue */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm text-foreground">Open Follow-ups</h3>
          <span className="text-xs text-muted-foreground">{pending.length} pending</span>
        </div>

        {pending.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
            All caught up ✓
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map(fu => {
              const due = formatDue(fu.dueDate);
              return (
                <div
                  key={fu.id}
                  data-testid={`followup-${fu.id}`}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <button
                    data-testid={`btn-done-${fu.id}`}
                    onClick={() => onMarkDone(fu.id)}
                    className="mt-0.5 w-5 h-5 rounded-full border-2 border-muted-foreground/40 hover:border-primary flex items-center justify-center shrink-0 transition-colors"
                  >
                    <CheckCircle2 size={12} className="text-transparent hover:text-primary" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground truncate">
                      Contact #{fu.contactId}
                    </div>
                    {fu.note && (
                      <div className="text-xs text-muted-foreground truncate">{fu.note}</div>
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium shrink-0 ${due.overdue ? "text-red-500" : "text-muted-foreground"}`}
                  >
                    {due.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AccountabilityPage() {
  const [selectedRep, setSelectedRep] = useState<RepSummary | null>(null);

  const { data: team = [], isLoading } = useQuery<RepSummary[]>({
    queryKey: ["/api/accountability/team"],
  });

  const { data: allFollowUps = [] } = useQuery<FollowUp[]>({
    queryKey: ["/api/follow-ups"],
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

  // ── Derived totals ────────────────────────────────────────────────────────
  const totals = team.reduce(
    (acc, r) => ({
      events:    acc.events    + r.eventsAttended,
      contacts:  acc.contacts  + r.contactsCaptured,
      fuTotal:   acc.fuTotal   + r.followUpTotal,
      fuDone:    acc.fuDone    + r.followUpDone,
      exports:   acc.exports   + r.crmExports,
    }),
    { events: 0, contacts: 0, fuTotal: 0, fuDone: 0, exports: 0 }
  );

  const teamFollowPct = totals.fuTotal > 0
    ? Math.round((totals.fuDone / totals.fuTotal) * 100)
    : 0;

  const overdueCount = allFollowUps.filter(f => {
    if (f.status === "done") return false;
    const today = new Date().toISOString().split("T")[0];
    return f.dueDate < today;
  }).length;

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3 overflow-x-auto pb-1">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 flex-1 min-w-[130px] rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Rep detail view
  if (selectedRep) {
    return (
      <RepDetail
        rep={selectedRep}
        followUps={allFollowUps}
        onBack={() => setSelectedRep(null)}
        onMarkDone={(id) => markDone.mutate(id)}
      />
    );
  }

  // Empty state — no reps yet
  if (team.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Team Activity</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Activity tracking — not outcomes
        </p>
      </div>

      {/* KPI strip — horizontal scroll on mobile */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
        <KpiCard
          icon={<CalendarCheck size={12} />}
          label="Events"
          value={totals.events}
          sub={`${team.length} reps`}
        />
        <KpiCard
          icon={<Users size={12} />}
          label="Contacts"
          value={totals.contacts}
        />
        <KpiCard
          icon={<UserCheck size={12} />}
          label="Follow-up"
          value={`${teamFollowPct}%`}
          sub={`${totals.fuDone}/${totals.fuTotal}`}
        />
        {overdueCount > 0 && (
          <KpiCard
            icon={<AlertCircle size={12} />}
            label="Overdue"
            value={overdueCount}
            sub="need attention"
          />
        )}
      </div>

      {/* Overdue alert bar */}
      {overdueCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5">
          <AlertCircle size={14} className="text-red-500 shrink-0" />
          <span className="text-sm text-red-500 font-medium">
            {overdueCount} overdue follow-up{overdueCount > 1 ? "s" : ""} need attention
          </span>
        </div>
      )}

      {/* Rep grid — 1 col mobile, 2 col tablet+ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm text-foreground">Rep Performance</h2>
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

      {/* Score key */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Activity Score Key
        </div>
        <div className="grid grid-cols-3 gap-2">
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
          Based on attendance, contacts captured, and follow-up rate — not revenue
        </p>
      </div>
    </div>
  );
}
