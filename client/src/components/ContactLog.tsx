/**
 * ContactLog — people met at an event.
 * Full contact cards always visible, inline editing, hot-lead toggle,
 * email/call/LinkedIn quick-actions, follow-up note per contact.
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
  UserPlus, Trash2, Flame, Mail, Phone,
  X, Pencil, Check, ExternalLink, Download,
} from "lucide-react";

// ── Blank form ────────────────────────────────────────────────────────────────
const BLANK = {
  name: "", title: "", company: "",
  email: "", phone: "", linkedin: "",
  notes: "", hotLead: 0 as 0 | 1,
};

// ── Compact contact card (always rendered) ────────────────────────────────────
function ContactCard({
  contact,
  eventId,
}: {
  contact: Contact;
  eventId: number;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<typeof BLANK>({
    name:     contact.name,
    title:    contact.title     ?? "",
    company:  contact.company   ?? "",
    email:    contact.email     ?? "",
    phone:    contact.phone     ?? "",
    linkedin: contact.linkedin  ?? "",
    notes:    contact.notes     ?? "",
    hotLead:  (contact.hotLead as 0 | 1) ?? 0,
  });

  const set = (k: keyof typeof BLANK, v: string | number) =>
    setForm(f => ({ ...f, [k]: v }));

  const updateMutation = useMutation({
    mutationFn: (data: typeof BLANK) =>
      apiRequest("PATCH", `/api/contacts/${contact.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/contacts`] });
      setEditing(false);
      toast({ title: "Contact updated" });
    },
    onError: () => toast({ title: "Error", description: "Could not update contact.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/contacts/${contact.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/contacts`] });
      toast({ title: "Contact removed" });
    },
  });

  const toggleHot = useMutation({
    mutationFn: (hotLead: number) =>
      apiRequest("PATCH", `/api/contacts/${contact.id}`, { hotLead }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/contacts`] }),
  });

  if (editing) {
    return (
      <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Job Title</label>
            <Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="HR Manager" className="h-8 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Company</label>
            <Input value={form.company} onChange={e => set("company", e.target.value)} placeholder="Acme Corp" className="h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Email</label>
            <Input value={form.email} onChange={e => set("email", e.target.value)} type="email" placeholder="jane@acme.com" className="h-8 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
            <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(210) 555-0123" className="h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">LinkedIn URL</label>
            <Input value={form.linkedin} onChange={e => set("linkedin", e.target.value)} placeholder="linkedin.com/in/jane" className="h-8 text-sm" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Follow-up Note</label>
          <Textarea
            value={form.notes}
            onChange={e => set("notes", e.target.value)}
            placeholder="Interested in temp-to-hire, call back Thursday..."
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
            <Flame size={12} /> Hot Lead
          </button>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setEditing(false)}>
              <X size={12} className="mr-1" /> Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 bg-primary text-primary-foreground"
              onClick={() => updateMutation.mutate(form)}
              disabled={!form.name.trim() || updateMutation.isPending}
            >
              <Check size={12} className="mr-1" />
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Read view — always fully visible ─────────────────────────────────────
  return (
    <div className="p-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
      {/* Name row */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          {contact.hotLead ? (
            <Flame size={13} className="text-orange-500 shrink-0 mt-0.5" />
          ) : (
            <div className="w-3 h-3 rounded-full bg-primary/20 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{contact.name}</p>
            {(contact.title || contact.company) && (
              <p className="text-xs text-muted-foreground">
                {[contact.title, contact.company].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => toggleHot.mutate(contact.hotLead ? 0 : 1)}
            className={cn(
              "p-1.5 rounded-md transition-colors text-xs",
              contact.hotLead
                ? "text-orange-500 bg-orange-50 dark:bg-orange-900/20"
                : "text-muted-foreground hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20"
            )}
            title={contact.hotLead ? "Remove hot lead" : "Mark as hot lead"}
          >
            <Flame size={12} />
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Edit contact"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            onClick={() => deleteMutation.mutate()}
            className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Remove contact"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Contact detail pills — always visible */}
      <div className="flex flex-wrap gap-1.5 mt-1 ml-5">
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="inline-flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-full px-2 py-0.5 hover:bg-blue-100 transition-colors"
          >
            <Mail size={10} /> {contact.email}
          </a>
        )}
        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            className="inline-flex items-center gap-1 text-xs bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 rounded-full px-2 py-0.5 hover:bg-green-100 transition-colors"
          >
            <Phone size={10} /> {contact.phone}
          </a>
        )}
        {contact.linkedin && (
          <a
            href={contact.linkedin.startsWith("http") ? contact.linkedin : `https://${contact.linkedin}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-full px-2 py-0.5 hover:bg-sky-100 transition-colors"
          >
            <ExternalLink size={10} /> LinkedIn
          </a>
        )}
      </div>

      {/* Quick email follow-up button */}
      {contact.email && (
        <div className="ml-5 mt-2">
          <a
            href={`mailto:${contact.email}?subject=Great meeting you!&body=Hi ${contact.name.split(' ')[0]},%0D%0A%0D%0AIt was great connecting with you. I wanted to follow up...`}
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-md px-2.5 py-1.5 transition-colors"
          >
            <Mail size={11} /> Send Follow-up Email
          </a>
        </div>
      )}

      {/* Follow-up note */}
      {contact.notes && (
        <div className="ml-5 mt-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-2.5 py-1.5 border-l-2 border-primary/30">
          {contact.notes}
        </div>
      )}
    </div>
  );
}

// ── Add contact form ──────────────────────────────────────────────────────────
function AddContactForm({
  eventId,
  onDone,
}: {
  eventId: number;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...BLANK });
  const set = (k: keyof typeof BLANK, v: string | number) =>
    setForm(f => ({ ...f, [k]: v }));

  const createMutation = useMutation({
    mutationFn: (data: typeof BLANK) =>
      apiRequest("POST", `/api/events/${eventId}/contacts`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/contacts`] });
      toast({ title: "Contact saved" });
      onDone();
    },
    onError: () => toast({ title: "Error", description: "Could not save contact.", variant: "destructive" }),
  });

  return (
    <div className="p-3 bg-primary/5 border-b border-primary/20 space-y-2">
      <p className="text-xs font-semibold text-primary uppercase tracking-wide">New Contact</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
          <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Jane Smith" className="h-8 text-sm" autoFocus />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Job Title</label>
          <Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="HR Manager" className="h-8 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Company</label>
          <Input value={form.company} onChange={e => set("company", e.target.value)} placeholder="Acme Corp" className="h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Email</label>
          <Input value={form.email} onChange={e => set("email", e.target.value)} type="email" placeholder="jane@acme.com" className="h-8 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
          <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(210) 555-0123" className="h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">LinkedIn URL</label>
          <Input value={form.linkedin} onChange={e => set("linkedin", e.target.value)} placeholder="linkedin.com/in/jane" className="h-8 text-sm" />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Follow-up Note</label>
        <Textarea
          value={form.notes}
          onChange={e => set("notes", e.target.value)}
          placeholder="Interested in temp-to-hire, call back Thursday..."
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
          <Flame size={12} /> Hot Lead
        </button>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={onDone}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 bg-primary text-primary-foreground"
            onClick={() => createMutation.mutate(form)}
            disabled={!form.name.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Saving..." : "Save Contact"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── CSV export ───────────────────────────────────────────────────────────────
function exportCSV(contacts: Contact[]) {
  const headers = ["Name", "Title", "Company", "Email", "Phone", "LinkedIn", "Hot Lead", "Notes"];
  const rows = contacts.map(c => [
    c.name,
    c.title ?? "",
    c.company ?? "",
    c.email ?? "",
    c.phone ?? "",
    c.linkedin ?? "",
    c.hotLead ? "Yes" : "No",
    (c.notes ?? "").replace(/\n/g, " "),
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contacts-export.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main ContactLog ───────────────────────────────────────────────────────────
export function ContactLog({ eventId }: { eventId: number }) {
  const [adding, setAdding] = useState(false);

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: [`/api/events/${eventId}/contacts`],
    queryFn: () =>
      apiRequest("GET", `/api/events/${eventId}/contacts`).then(r => r.json()),
    staleTime: 0, // always re-fetch when modal opens
  });

  const hotCount = contacts.filter(c => c.hotLead).length;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <UserPlus size={13} className="text-primary" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Contact Log</span>
          {contacts.length > 0 && (
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
              {contacts.length}
            </span>
          )}
          {hotCount > 0 && (
            <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
              <Flame size={10} /> {hotCount} hot
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {contacts.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs gap-1"
              onClick={() => exportCSV(contacts)}
              title="Export contacts to CSV"
            >
              <Download size={11} /> Export
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant={adding ? "outline" : "default"}
            className={cn("h-7 px-2.5 text-xs gap-1", !adding && "bg-primary text-primary-foreground")}
            onClick={() => setAdding(!adding)}
          >
            {adding ? <><X size={11} /> Cancel</> : <><UserPlus size={11} /> Add Contact</>}
          </Button>
        </div>
      </div>

      {/* Add form */}
      {adding && <AddContactForm eventId={eventId} onDone={() => setAdding(false)} />}

      {/* Contact list */}
      {isLoading && (
        <div className="p-4 text-sm text-muted-foreground text-center">Loading contacts...</div>
      )}
      {!isLoading && contacts.length === 0 && !adding && (
        <div className="p-4 text-center">
          <p className="text-sm text-muted-foreground">No contacts yet.</p>
          <p className="text-xs text-muted-foreground mt-0.5">Add people you met — name, email, phone, LinkedIn, and a follow-up note.</p>
        </div>
      )}
      {contacts.map(c => (
        <ContactCard key={c.id} contact={c} eventId={eventId} />
      ))}
    </div>
  );
}
