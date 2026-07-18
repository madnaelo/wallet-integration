"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const INSTALL_DISMISSED_KEY = "wallet.pwaInstall.dismissed.v1";
const DEVELOPMENT_RELOAD_KEY = "swap-assistant.pwa.dev-cleanup.v1";
const PWA_CACHE_PREFIX = "swap-assistant-pwa-";

export function PwaClient() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(true);

  useEffect(() => {
    if (!isServiceWorkerSupported()) return;
    if (process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
      return;
    }
    void removeDevelopmentServiceWorker().catch(() => undefined);
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
    <div className="installPrompt" role="region" aria-label="Install Swap Assistant">
      <div>
        <strong>Install Swap Assistant</strong>
        <span>Open faster and receive push notifications on this device.</span>
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

async function removeDevelopmentServiceWorker() {
  const expectedScope = new URL("/", window.location.origin).href;
  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  const projectRegistrations = registrations.filter((registration) => registration.scope === expectedScope);
  const hadProjectWorker = projectRegistrations.length > 0 || Boolean(navigator.serviceWorker.controller);

  await Promise.all(projectRegistrations.map((registration) => registration.unregister().catch(() => false)));

  if ("caches" in window) {
    const cacheNames = await window.caches.keys().catch(() => []);
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith(PWA_CACHE_PREFIX))
        .map((cacheName) => window.caches.delete(cacheName))
    );
  }

  if (hadProjectWorker && sessionStorage.getItem(DEVELOPMENT_RELOAD_KEY) !== "true") {
    sessionStorage.setItem(DEVELOPMENT_RELOAD_KEY, "true");
    window.location.reload();
    return;
  }
  if (!hadProjectWorker) sessionStorage.removeItem(DEVELOPMENT_RELOAD_KEY);
}
