/**
 * Global Contacts page — all contacts across every event.
 * Features: search, filter by event type / hot lead, bulk select,
 * bulk CSV export, bulk TouchPoint-ready copy, single-contact email.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { type Contact } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Users, Flame, Mail, Phone, ExternalLink,
  Download, Search, CheckSquare, Square, Copy,
  Building2, Filter, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── Types ─────────────────────────────────────────────────────────────────────
type GlobalContact = Contact & {
  eventTitle: string;
  eventType: string;
  eventDate: string | null;
};

// ── Event type color map ──────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  "Chamber":          "#2563FF",
  "Networking":       "#8B5CF6",
  "Job Fair":         "#00D4FF",
  "Trade Show":       "#FF9F1C",
  "Client Visit":     "#FF5C7A",
  "Prospect Meeting": "#10b981",
  "Other":            "#64748B",
};

// ── CRM export helpers ────────────────────────────────────────────────────────

type ExportFormat = "csv" | "salesforce" | "hubspot" | "touchpoint";

function exportViaServer(format: ExportFormat, ids?: number[]) {
  const base = `/api/contacts/export/${format}`;
  const url  = ids && ids.length > 0 ? `${base}?ids=${ids.join(",")}` : base;
  // Trigger download via hidden anchor
  const a = document.createElement("a");
  a.href = url;
  a.click();
}

// Fallback: copy tab-separated to clipboard for TouchPoint paste
function copyForCRM(rows: GlobalContact[]) {
  const headers = ["Name","Title","Company","Email","Phone","LinkedIn","Event","Event Date"];
  const lines = rows.map(c => [
    c.name, c.title ?? "", c.company ?? "", c.email ?? "",
    c.phone ?? "", c.linkedin ?? "", c.eventTitle ?? "", c.eventDate ?? "",
  ].join("\t"));
  navigator.clipboard.writeText([headers.join("\t"), ...lines].join("\n"));
}

// ── Contact row ───────────────────────────────────────────────────────────────
function ContactRow({
  contact, selected, onToggle,
}: {
  contact: GlobalContact;
  selected: boolean;
  onToggle: () => void;
}) {
  const typeColor = TYPE_COLORS[contact.eventType] ?? "#64748B";

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0 transition-colors cursor-pointer",
        selected
          ? "bg-primary/5 dark:bg-primary/10"
          : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
      )}
      onClick={onToggle}
    >
      {/* Checkbox */}
      <div className="mt-0.5 shrink-0 text-primary">
        {selected ? <CheckSquare size={16} /> : <Square size={16} className="text-muted-foreground" />}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{contact.name}</span>
          {contact.hotLead ? (
            <Flame size={12} className="text-orange-500 shrink-0" />
          ) : null}
          {/* Event type badge */}
          {contact.eventType && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{
                background: typeColor + "22",
                color: typeColor,
                border: `1px solid ${typeColor}44`,
              }}
            >
              {contact.eventType}
            </span>
          )}
        </div>

        {/* Title / Company */}
        {(contact.title || contact.company) && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {[contact.title, contact.company].filter(Boolean).join(" · ")}
          </p>
        )}

        {/* Event name */}
        {contact.eventTitle && (
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Building2 size={10} className="shrink-0" />
            {contact.eventTitle}
            {contact.eventDate && <span className="opacity-60">· {contact.eventDate}</span>}
          </p>
        )}

        {/* Contact action pills */}
        <div className="flex flex-wrap gap-1.5 mt-1.5" onClick={e => e.stopPropagation()}>
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex items-center gap-1 text-[11px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-full px-2 py-0.5 hover:bg-blue-100 transition-colors"
            >
              <Mail size={10} /> {contact.email}
            </a>
          )}
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              className="inline-flex items-center gap-1 text-[11px] bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 rounded-full px-2 py-0.5 hover:bg-green-100 transition-colors"
            >
              <Phone size={10} /> {contact.phone}
            </a>
          )}
          {contact.linkedin && (
            <a
              href={contact.linkedin.startsWith("http") ? contact.linkedin : `https://${contact.linkedin}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-full px-2 py-0.5 hover:bg-sky-100 transition-colors"
            >
              <ExternalLink size={10} /> LinkedIn
            </a>
          )}
        </div>

        {/* Follow-up note */}
        {contact.notes && (
          <p className="text-xs text-muted-foreground mt-1.5 bg-muted/40 rounded-md px-2 py-1 border-l-2 border-primary/30">
            {contact.notes}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [filterHot, setFilterHot] = useState(false);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  const { data: contacts = [], isLoading } = useQuery<GlobalContact[]>({
    queryKey: ["/api/contacts"],
    queryFn: () => apiRequest("GET", "/api/contacts").then(r => r.json()),
    staleTime: 0,
  });

  // Unique event types for filter pills
  const eventTypes = useMemo(() => {
    const types = new Set(contacts.map(c => c.eventType).filter(Boolean));
    return Array.from(types) as string[];
  }, [contacts]);

  // Filtered list
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return contacts.filter(c => {
      if (filterHot && !c.hotLead) return false;
      if (filterType && c.eventType !== filterType) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.company ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.title ?? "").toLowerCase().includes(q) ||
        (c.eventTitle ?? "").toLowerCase().includes(q)
      );
    });
  }, [contacts, search, filterHot, filterType]);

  const selectedContacts = filtered.filter(c => selected.has(c.id));
  const allSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id));
  const hotCount = contacts.filter(c => c.hotLead).length;

  function toggleAll() {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        filtered.forEach(c => next.delete(c.id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        filtered.forEach(c => next.add(c.id));
        return next;
      });
    }
  }

  function toggleOne(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleCopyForCRM() {
    const rows = selectedContacts.length > 0 ? selectedContacts : filtered;
    copyForCRM(rows);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleExportCSV() {
    exportViaServer("csv", selectedContacts.length > 0 ? selectedContacts.map(c => c.id) : undefined);
  }

  const exportCount = selectedContacts.length > 0 ? selectedContacts.length : filtered.length;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-primary" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {contacts.length} Contact{contacts.length !== 1 ? "s" : ""}
          </span>
          {hotCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full font-medium">
              <Flame size={10} /> {hotCount} hot
            </span>
          )}
        </div>

        {/* Export dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground"
              disabled={contacts.length === 0}
              data-testid="button-export-dropdown"
            >
              <Download size={12} />
              Export{selectedContacts.length > 0 ? ` (${exportCount})` : ""}
              <ChevronDown size={11} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              {selectedContacts.length > 0 ? `${exportCount} selected contacts` : "All contacts"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => exportViaServer("csv", selectedContacts.length > 0 ? selectedContacts.map(c => c.id) : undefined)}
              data-testid="export-csv"
            >
              <Download size={13} className="mr-2" />
              Generic CSV
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => exportViaServer("salesforce", selectedContacts.length > 0 ? selectedContacts.map(c => c.id) : undefined)}
              data-testid="export-salesforce"
            >
              <Download size={13} className="mr-2" />
              Salesforce Leads
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => exportViaServer("hubspot", selectedContacts.length > 0 ? selectedContacts.map(c => c.id) : undefined)}
              data-testid="export-hubspot"
            >
              <Download size={13} className="mr-2" />
              HubSpot Contacts
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleCopyForCRM}
              data-testid="export-touchpoint"
            >
              <Copy size={13} className="mr-2" />
              {copied ? "Copied!" : "Copy for TouchPoint"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Search + filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, company, email, event..."
            className="pl-8 h-9 text-sm"
            data-testid="input-contact-search"
          />
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Filter size={11} /> Filter:
          </span>
          <button
            onClick={() => setFilterHot(!filterHot)}
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border transition-all",
              filterHot
                ? "bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-600 text-orange-700 dark:text-orange-300"
                : "bg-background border-border text-muted-foreground hover:border-orange-300"
            )}
          >
            <Flame size={10} /> Hot Leads
          </button>
          {eventTypes.map(type => (
            <button
              key={type}
              onClick={() => setFilterType(filterType === type ? null : type)}
              className={cn(
                "text-xs font-medium px-2.5 py-1 rounded-full border transition-all"
              )}
              style={
                filterType === type
                  ? {
                      background: (TYPE_COLORS[type] ?? "#64748B") + "22",
                      color: TYPE_COLORS[type] ?? "#64748B",
                      borderColor: (TYPE_COLORS[type] ?? "#64748B") + "66",
                    }
                  : { background: "transparent", color: "var(--muted-foreground)", borderColor: "var(--border)" }
              }
            >
              {type}
            </button>
          ))}
          {(filterHot || filterType || search) && (
            <button
              onClick={() => { setFilterHot(false); setFilterType(null); setSearch(""); }}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Contact list */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* List header with select-all */}
        {filtered.length > 0 && (
          <div
            className="flex items-center gap-3 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 cursor-pointer"
            onClick={toggleAll}
          >
            <div className="text-primary">
              {allSelected
                ? <CheckSquare size={15} />
                : <Square size={15} className="text-muted-foreground" />}
            </div>
            <span className="text-xs text-muted-foreground">
              {selected.size > 0
                ? `${selected.size} selected · click to ${allSelected ? "deselect all" : "select all"}`
                : `Select all ${filtered.length} contacts`}
            </span>
            {selected.size > 0 && (
              <span className="ml-auto text-xs font-medium text-primary">
                {selected.size} selected
              </span>
            )}
          </div>
        )}

        {isLoading && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loading contacts...
          </div>
        )}

        {!isLoading && contacts.length === 0 && (
          <div className="p-8 text-center">
            <Users size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No contacts yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add contacts from the Contact Log inside any event card.
            </p>
          </div>
        )}

        {!isLoading && contacts.length > 0 && filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No contacts match your search.
          </div>
        )}

        {filtered.map(c => (
          <ContactRow
            key={c.id}
            contact={c}
            selected={selected.has(c.id)}
            onToggle={() => toggleOne(c.id)}
          />
        ))}
      </div>

      {/* Bottom action bar — visible when contacts are selected */}
      {selected.size > 0 && (
        <div className="sticky bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between gap-2 rounded-lg shadow-lg">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {selected.size} contact{selected.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleCopyForCRM}>
              <Copy size={12} /> {copied ? "Copied!" : "Copy for CRM"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground">
                  <Download size={12} /> Export <ChevronDown size={11} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => exportViaServer("csv", selectedContacts.map(c => c.id))}>Generic CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportViaServer("salesforce", selectedContacts.map(c => c.id))}>Salesforce Leads</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportViaServer("hubspot", selectedContacts.map(c => c.id))}>HubSpot Contacts</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleCopyForCRM}>{copied ? "Copied!" : "Copy for TouchPoint"}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
