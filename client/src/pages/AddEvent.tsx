import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { insertEventSchema, EVENT_TYPES, ATTENDING_OPTIONS } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { Calendar, Link2, User, MapPin, FileText, Clock, Sparkles, Loader2, CheckCircle2 } from "lucide-react";

const formSchema = insertEventSchema.extend({
  title: z.string().min(2, "Title must be at least 2 characters"),
  eventDate: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  addedBy: z.string().min(1, "Select who's adding this event"),
  attending: z.string().min(1, "Select who is attending"),
  eventType: z.string().min(1, "Select an event type"),
});

type FormValues = z.infer<typeof formSchema>;

const EVENT_TYPE_COLORS: Record<string, string> = {
  "Chamber":      "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-600",
  "Networking":   "border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-600",
  "Job Fair":     "border-cyan-400 bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-500",
  "Trade Show":   "border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-500",
  "Client Visit": "border-pink-400 bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-500",
  "Other":        "border-slate-400 bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
};

const ATTENDING_COLORS: Record<string, string> = {
  "Ryan":      "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-600",
  "Connie":    "border-pink-500 bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-600",
  "Both":      "border-cyan-400 bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-500",
  "Tentative": "border-yellow-400 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-500",
};

function ToggleButton({
  label, selected, onClick, colorClass,
}: {
  label: string; selected: boolean; onClick: () => void; colorClass: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`toggle-${label.toLowerCase().replace(/\s/g, "-")}`}
      className={cn(
        "px-3 py-2 rounded-md border text-sm font-medium transition-all",
        selected
          ? colorClass + " ring-2 ring-offset-1 ring-primary/40 shadow-sm"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

export default function AddEventPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();

  // Parse ?url= query param (from bookmarklet)
  const prefillUrl = (() => {
    try {
      return new URLSearchParams(search).get("url") || "";
    } catch {
      return "";
    }
  })();

  const today = new Date().toISOString().split("T")[0];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      eventType: "",
      eventDate: today,
      startTime: "",
      endTime: "",
      location: "",
      sourceUrl: prefillUrl,
      sourcePlatform: "manual",
      addedBy: "",
      attending: "",
      notes: "",
      reminderMinutes: 60,
      status: "upcoming",
    },
  });

  // URL parser state
  const [parseStatus, setParseStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const urlDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-parse when prefillUrl is present on mount
  useEffect(() => {
    if (prefillUrl) {
      form.setValue("sourceUrl", prefillUrl);
      triggerParse(prefillUrl);
    }
  }, []);

  // Watch sourceUrl field and auto-parse on change (debounced)
  const sourceUrlValue = form.watch("sourceUrl");
  const prevUrlRef = useRef("");

  useEffect(() => {
    const url = sourceUrlValue || "";
    if (!url || url === prevUrlRef.current) return;
    if (!url.startsWith("http")) return;

    if (urlDebounceRef.current) clearTimeout(urlDebounceRef.current);
    urlDebounceRef.current = setTimeout(() => {
      prevUrlRef.current = url;
      triggerParse(url);
    }, 900);

    return () => {
      if (urlDebounceRef.current) clearTimeout(urlDebounceRef.current);
    };
  }, [sourceUrlValue]);

  async function triggerParse(url: string) {
    setParseStatus("loading");
    try {
      const res = await apiRequest("POST", "/api/parse-url", { url });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Only fill fields that are currently empty (don't overwrite user edits)
      if (data.title && !form.getValues("title")) form.setValue("title", data.title);
      if (data.notes && !form.getValues("notes")) form.setValue("notes", data.notes);
      if (data.location && !form.getValues("location")) form.setValue("location", data.location);
      if (data.eventDate && !form.getValues("eventDate")) form.setValue("eventDate", data.eventDate);
      else if (data.eventDate) form.setValue("eventDate", data.eventDate); // always update date
      if (data.startTime && !form.getValues("startTime")) form.setValue("startTime", data.startTime);
      if (data.endTime && !form.getValues("endTime")) form.setValue("endTime", data.endTime);
      if (data.sourcePlatform) form.setValue("sourcePlatform", data.sourcePlatform);
      if (data.eventType && !form.getValues("eventType")) form.setValue("eventType", data.eventType);

      setParseStatus("done");
    } catch (e) {
      setParseStatus("error");
    }
  }

  const createMutation = useMutation({
    mutationFn: (data: FormValues) => apiRequest("POST", "/api/events", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/upcoming"] });
      toast({ title: "Event saved", description: "Added to the sales calendar." });
      navigate("/");
    },
    onError: () => {
      toast({ title: "Error", description: "Could not save the event.", variant: "destructive" });
    },
  });

  const onSubmit = (data: FormValues) => {
    createMutation.mutate(data);
  };

  const eventType = form.watch("eventType");
  const attending = form.watch("attending");
  const addedBy = form.watch("addedBy");

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-foreground">Add Event</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste a URL to auto-fill — or enter details manually.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

          {/* Source URL — moved to TOP so it auto-fills everything below */}
          <FormField
            control={form.control}
            name="sourceUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Sparkles size={13} className="text-primary" />
                  Paste Event URL
                  <span className="text-xs font-normal text-muted-foreground ml-1">— auto-fills the form</span>
                </FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="url"
                      placeholder="https://linkedin.com/events/...  or  https://sachamber.org/events/..."
                      data-testid="input-source-url"
                      className={cn(
                        "pr-10 text-sm",
                        parseStatus === "done" && "border-green-400 focus-visible:ring-green-400",
                        parseStatus === "error" && "border-red-400 focus-visible:ring-red-400",
                      )}
                    />
                  </FormControl>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {parseStatus === "loading" && <Loader2 size={15} className="animate-spin text-muted-foreground" />}
                    {parseStatus === "done"    && <CheckCircle2 size={15} className="text-green-500" />}
                  </div>
                </div>
                {parseStatus === "loading" && (
                  <p className="text-xs text-muted-foreground mt-1">Fetching event details...</p>
                )}
                {parseStatus === "done" && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">Fields auto-filled — review and adjust below.</p>
                )}
                {parseStatus === "error" && (
                  <p className="text-xs text-red-500 mt-1">Couldn't parse that URL. Fill in details manually.</p>
                )}
              </FormItem>
            )}
          />

          <div className="border-t border-border/50 pt-1" />

          {/* Title */}
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Event Name *</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="e.g. SA Chamber Monthly Mixer"
                    data-testid="input-title"
                    className="text-base"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Event Type toggle buttons */}
          <FormField
            control={form.control}
            name="eventType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Event Type *</FormLabel>
                <div className="flex flex-wrap gap-2 mt-1">
                  {EVENT_TYPES.map((t) => (
                    <ToggleButton
                      key={t}
                      label={t}
                      selected={field.value === t}
                      onClick={() => field.onChange(t)}
                      colorClass={EVENT_TYPE_COLORS[t]}
                    />
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Date / Times */}
          <div className="grid grid-cols-3 gap-3">
            <FormField
              control={form.control}
              name="eventDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="startTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start *</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} data-testid="input-start-time" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End *</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} data-testid="input-end-time" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Location */}
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5"><MapPin size={13} /> Location</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} placeholder="Venue or address" data-testid="input-location" />
                </FormControl>
              </FormItem>
            )}
          />

          {/* Source Platform */}
          <FormField
            control={form.control}
            name="sourcePlatform"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Found Via</FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? "manual"}>
                  <FormControl>
                    <SelectTrigger data-testid="select-platform">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="chamber">Chamber / Association site</SelectItem>
                    <SelectItem value="website">Other website</SelectItem>
                    <SelectItem value="manual">Manual / Word of mouth</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          {/* Added By */}
          <FormField
            control={form.control}
            name="addedBy"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5"><User size={13} /> Added By *</FormLabel>
                <div className="flex gap-2 mt-1">
                  {["Ryan", "Connie"].map((name) => (
                    <ToggleButton
                      key={name}
                      label={name}
                      selected={field.value === name}
                      onClick={() => field.onChange(name)}
                      colorClass={ATTENDING_COLORS[name]}
                    />
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Attending */}
          <FormField
            control={form.control}
            name="attending"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Who's Attending? *</FormLabel>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {ATTENDING_OPTIONS.map((opt) => (
                    <ToggleButton
                      key={opt}
                      label={opt}
                      selected={field.value === opt}
                      onClick={() => field.onChange(opt)}
                      colorClass={ATTENDING_COLORS[opt] ?? ATTENDING_COLORS["Tentative"]}
                    />
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Notes */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5"><FileText size={13} /> Notes / Opportunity Context</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    placeholder="Who to meet, what to bring, key contacts, follow-up intent..."
                    rows={3}
                    data-testid="textarea-notes"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {/* Reminder */}
          <FormField
            control={form.control}
            name="reminderMinutes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5"><Clock size={13} /> Reminder</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === "none" ? null : parseInt(v))}
                  defaultValue="60"
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-reminder">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">No reminder</SelectItem>
                    <SelectItem value="60">1 hour before</SelectItem>
                    <SelectItem value="1440">1 day before</SelectItem>
                    <SelectItem value="2880">2 days before</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              disabled={createMutation.isPending}
              data-testid="button-save"
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {createMutation.isPending ? "Saving..." : "Save to Calendar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/")}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
          </div>

        </form>
      </Form>
    </div>
  );
}
