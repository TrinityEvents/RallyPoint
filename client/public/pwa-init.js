// RallyPoint PWA init — registers SW + requests push permission
(async function () {
  if (!("serviceWorker" in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    console.log("[PWA] SW registered:", reg.scope);
    window.__swReg = reg;
  } catch (e) {
    console.warn("[PWA] SW registration failed:", e);
  }
})();

// Called by the Settings page "Enable Push Notifications" button
window.requestPushPermission = async function () {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "not_supported" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  try {
    const reg = await navigator.serviceWorker.ready;
    const VAPID_PUBLIC = "BBZYw_F2ZDqiFGoryOWVYNTKRcBWaqgYCLM9XxEyQCy7Jn6oVTxGsNJIcKObIikM2mg1_fRsIykm4uBg7Pe9yRY";

    // Convert base64url VAPID key to Uint8Array
    const base64 = VAPID_PUBLIC.replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const key = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i);

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });

    // Send subscription to backend
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });

    return { ok: true };
  } catch (e) {
    console.error("[PWA] Push subscribe failed:", e);
    return { ok: false, reason: e.message };
  }
};
