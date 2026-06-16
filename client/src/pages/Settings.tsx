import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Mail, Eye, EyeOff, ExternalLink, AlertCircle, Bell, BellOff } from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();
  const [smtpUser, setSmtpUser] = useState("");

  // ── Push notification state ────────────────────────────────────
  const [pushSupported, setPushSupported] = useState(false);
  const [pushGranted, setPushGranted] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    setPushSupported("serviceWorker" in navigator && "PushManager" in window);
    setPushGranted("Notification" in window && Notification.permission === "granted");
  }, []);

  async function enablePush() {
    setPushLoading(true);
    try {
      const result = await (window as any).requestPushPermission?.();
      if (result?.ok) {
        setPushGranted(true);
        toast({ title: "Push notifications enabled", description: "You\'ll get alerted when new events are added." });
      } else {
        toast({ title: "Permission denied", description: "Allow notifications in your browser settings.", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: "Could not enable push notifications.", variant: "destructive" });
    } finally {
      setPushLoading(false);
    }
  }

  async function testPush() {
    setPushLoading(true);
    try {
      const res = await apiRequest("POST", "/api/push/test", {});
      const data = await res.json();
      if (data.ok) toast({ title: "Test push sent!", description: "Check your device for the notification." });
      else toast({ title: "Send failed", description: data.error, variant: "destructive" });
    } finally {
      setPushLoading(false);
    }
  }
  const [smtpPass, setSmtpPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [testEmail, setTestEmail] = useState("ryan@trinitystaffing.com");

  // Fetch current config status
  const { data: status, refetch } = useQuery<{ smtpConfigured: boolean; smtpUser?: string }>({
    queryKey: ["/api/settings/status"],
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/settings/smtp", { smtpUser, smtpPass }),
    onSuccess: () => {
      toast({ title: "Credentials saved", description: "Email notifications are now active." });
      setSmtpPass("");
      refetch();
    },
    onError: () => {
      toast({ title: "Error", description: "Could not save credentials.", variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/settings/test-email", { to: testEmail }),
    onSuccess: async (res) => {
      const data = await res.json();
      if (data.ok) {
        toast({ title: "Test email sent", description: `Check ${testEmail}` });
      } else {
        toast({ title: "Send failed", description: data.error || "Unknown error", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Could not send test email.", variant: "destructive" });
    },
  });

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure email notifications so both you and Connie get alerted when a new event is added.
        </p>
      </div>

      {/* Current status */}
      <div className={`rounded-lg border p-4 flex items-start gap-3 ${status?.smtpConfigured ? "border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700" : "border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700"}`}>
        {status?.smtpConfigured ? (
          <CheckCircle2 size={18} className="text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
        ) : (
          <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        )}
        <div>
          <p className="text-sm font-medium text-foreground">
            {status?.smtpConfigured
              ? `Notifications active — sending as ${status.smtpUser}`
              : "Notifications not configured"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {status?.smtpConfigured
              ? "Both Ryan and Connie will receive an email when any new event is added."
              : "Enter your Microsoft 365 app password below to enable email alerts."}
          </p>
        </div>
      </div>

      {/* SMTP credentials form */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center gap-2">
          <Mail size={14} />
          Microsoft 365 SMTP
        </h2>

        <div className="space-y-3">
          <div>
            <Label htmlFor="smtp-user">Your M365 Email</Label>
            <Input
              id="smtp-user"
              type="email"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              placeholder="ryan@trinitystaffing.com"
              data-testid="input-smtp-user"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="smtp-pass">
              App Password
              <a
                href="https://account.microsoft.com/security"
                target="_blank"
                rel="noreferrer"
                className="ml-2 text-xs text-primary hover:underline inline-flex items-center gap-0.5"
              >
                Get one <ExternalLink size={10} />
              </a>
            </Label>
            <div className="relative mt-1">
              <Input
                id="smtp-pass"
                type={showPass ? "text" : "password"}
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                placeholder="16-character app password"
                data-testid="input-smtp-pass"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              This is NOT your regular login password. Generate one at Microsoft Account → Security → App passwords.
            </p>
          </div>
        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !smtpUser || !smtpPass}
          data-testid="button-save-smtp"
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {saveMutation.isPending ? "Saving..." : "Save Credentials"}
        </Button>
      </div>

      {/* Test email */}
      {status?.smtpConfigured && (
        <div className="space-y-3 border-t border-border pt-6">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Send Test Email</h2>
          <div className="flex gap-2">
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="test@example.com"
              data-testid="input-test-email"
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !testEmail}
              data-testid="button-test-email"
            >
              {testMutation.isPending ? "Sending..." : "Send Test"}
            </Button>
          </div>
        </div>
      )}

      {/* Push Notifications */}
      {pushSupported && (
        <div className="space-y-3 border-t border-border pt-6">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center gap-2">
            <Bell size={14} /> Push Notifications
          </h2>
          <p className="text-sm text-muted-foreground">
            Get instant push alerts on this device when a new event is added — even when the app isn\'t open.
          </p>
          {pushGranted ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 size={15} /> Push enabled on this device
              </div>
              <Button size="sm" variant="outline" onClick={testPush} disabled={pushLoading}>
                {pushLoading ? "Sending..." : "Send Test Push"}
              </Button>
            </div>
          ) : (
            <Button
              onClick={enablePush}
              disabled={pushLoading}
              className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Bell size={14} />
              {pushLoading ? "Requesting..." : "Enable Push Notifications"}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Each device / browser needs to enable separately. Both Ryan and Connie should do this on their own phones.
          </p>
        </div>
      )}

      {/* Notification recipients info */}
      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
        <p className="text-sm font-medium text-foreground">Who gets notified?</p>
        <p className="text-sm text-muted-foreground">
          Every time either of you adds an event, <strong>both ryan@trinitystaffing.com and connie@trinitystaffing.com</strong> receive a formatted email with the event name, date, time, location, and a direct link back to the calendar.
        </p>
      </div>
    </div>
  );
}
