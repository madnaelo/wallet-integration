"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const INSTALL_DISMISSED_KEY = "wallet.pwaInstall.dismissed.v1";

export function PwaClient() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(true);

  useEffect(() => {
    if (!isServiceWorkerSupported()) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    setDismissed(localStorage.getItem(INSTALL_DISMISSED_KEY) === "true");

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setDismissed(localStorage.getItem(INSTALL_DISMISSED_KEY) === "true");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  const visible = useMemo(
    () => Boolean(installPrompt) && !dismissed && !isStandaloneDisplay(),
    [dismissed, installPrompt]
  );

  if (!visible) return null;

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => ({ outcome: "dismissed" as const, platform: "" }));
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
    } else {
      dismiss();
    }
  }

  function dismiss() {
    localStorage.setItem(INSTALL_DISMISSED_KEY, "true");
    setDismissed(true);
  }

  return (
    <div className="installPrompt" role="region" aria-label="Install The Wallet">
      <div>
        <strong>Install The Wallet</strong>
        <span>Open faster and receive browser alerts on this device.</span>
      </div>
      <button className="installPromptAction" type="button" onClick={install}>
        Install
      </button>
      <button className="installPromptClose" type="button" aria-label="Dismiss install prompt" onClick={dismiss}>
        x
      </button>
    </div>
  );
}

function isServiceWorkerSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && (window.isSecureContext || window.location.hostname === "localhost");
}

function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
