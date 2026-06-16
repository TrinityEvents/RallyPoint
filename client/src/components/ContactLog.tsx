/**
 * ContactLog — people met at an event.
 * Rendered inside the EditModal.
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { type Contact } from "@shared/schema";
import {
  UserPlus, Trash2, Flame, Mail, Phone, Linkedin,
  Building2, ChevronDown, ChevronUp, X, Check,
} from "lucide-react";

// ── Empty form state ──────────────────────────────────────────────────────────
const BLANK = {
  name: "", title: "", company: "", email: "",
  phone: "", linkedin: "", notes: "", hotLead: 0 as 0 | 1,
};

export function ContactLog({ eventId }: { eventId: number }) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [expanded, setExpanded] = useState<number | null>(null);

  // Fetch contacts for this event
  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: [`/api/events/${eventId}/contacts`],
    queryFn: () =>
      apiRequest("GET", `/api/events/${eventId}/contacts`).then((r) => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof BLANK) =>
      apiRequest("POST", `/api/events/${eventId}/contacts`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/contacts`] });
      setForm({ ...BLANK });
      setAdding(false);
      toast({ title: "Contact saved" });
    },
    onError: () => toast({ title: "Error", description: "Could not save contact.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/contacts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/contacts`] });
      toast({ title: "Contact removed" });
    },
  });

  const toggleHotLead = useMutation({
    mutationFn: ({ id, hotLead }: { id: number; hotLead: number }) =>
      apiRequest("PATCH", `/api/contacts/${id}`, { hotLead }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/contacts`] }),
  });

  const set = (k: keyof typeof BLANK, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <UserPlus size={13} className="text-primary" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Contact Log
          </span>
          {contacts.length > 0 && (
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
              {contacts.length}
            </span>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs gap-1 text-primary"
          onClick={() => setAdding(!adding)}
        >
          {adding ? <X size={12} /> : <UserPlus size={12} />}
          {adding ? "Cancel" : "Add"}
        </Button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="p-3 border-b border-slate-200 dark:border-slate-700 space-y-2 bg-white dark:bg-slate-900">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Jane Smith"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Job Title</label>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="HR Manager"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Company</label>
              <Input
                value={form.company}
                onChange={(e) => set("company", e.target.value)}
                placeholder="Acme Corp"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email</label>
              <Input
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="jane@acme.com"
                className="h-8 text-sm"
                type="email"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
              <Input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="(210) 555-0123"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">LinkedIn</label>
              <Input
                value={form.linkedin}
                onChange={(e) => set("linkedin", e.target.value)}
                placeholder="linkedin.com/in/jane"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Quick Note</label>
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Interested in temp-to-hire, follow up next week..."
              rows={2}
              className="text-sm resize-none"
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => set("hotLead", form.hotLead ? 0 : 1)}
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border transition-all",
                form.hotLead
                  ? "bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-900/30 dark:border-orange-600 dark:text-orange-300"
                  : "bg-background border-border text-muted-foreground hover:border-orange-300"
              )}
            >
              <Flame size={12} />
              Hot Lead
            </button>
            <Button
              type="button"
              size="sm"
              onClick={() => createMutation.mutate(form)}
              disabled={!form.name.trim() || createMutation.isPending}
              className="h-8 bg-primary text-primary-foreground"
            >
              {createMutation.isPending ? "Saving..." : "Save Contact"}
            </Button>
          </div>
        </div>
      )}

      {/* Contact list */}
      {isLoading && (
        <div className="p-3 text-sm text-muted-foreground">Loading...</div>
      )}
      {!isLoading && contacts.length === 0 && !adding && (
        <div className="p-4 text-center text-sm text-muted-foreground">
          No contacts logged yet — add people you met at this event.
        </div>
      )}
      {contacts.map((c) => (
        <div key={c.id} className="border-b border-slate-100 dark:border-slate-700/50 last:border-0">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              {c.hotLead ? (
                <Flame size={13} className="text-orange-500 shrink-0" />
              ) : (
                <div className="w-[13px] shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{c.name}</p>
                {(c.title || c.company) && (
                  <p className="text-xs text-muted-foreground truncate">
                    {[c.title, c.company].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {expanded === c.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <button
                type="button"
                onClick={() => toggleHotLead.mutate({ id: c.id, hotLead: c.hotLead ? 0 : 1 })}
                className={cn(
                  "p-1 rounded transition-colors",
                  c.hotLead
                    ? "text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                    : "text-muted-foreground hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                )}
                title={c.hotLead ? "Remove hot lead" : "Mark as hot lead"}
              >
                <Flame size={13} />
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(c.id)}
                className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Expanded contact details */}
          {expanded === c.id && (
            <div className="px-3 pb-3 space-y-1.5">
              {c.email && (
                <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-xs text-primary hover:underline">
                  <Mail size={11} /> {c.email}
                </a>
              )}
              {c.phone && (
                <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                  <Phone size={11} /> {c.phone}
                </a>
              )}
              {c.linkedin && (
                <a
                  href={c.linkedin.startsWith("http") ? c.linkedin : `https://${c.linkedin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-blue-600 hover:underline"
                >
                  <Linkedin size={11} /> {c.linkedin}
                </a>
              )}
              {c.notes && (
                <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5 mt-1">
                  {c.notes}
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
