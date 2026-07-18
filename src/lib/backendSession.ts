import { BackendClientError, type BackendSession } from "@/lib/backendClient";

const BACKEND_SESSION_STORAGE_KEY = "wallet.swapAssistant.backendSession.v1";
const EXPIRY_SAFETY_WINDOW_MS = 60_000;

export function readStoredBackendSession(): BackendSession | null {
  if (typeof window === "undefined") return null;
  removeStorageCopy("localStorage");

  try {
    const raw = window.sessionStorage.getItem(BACKEND_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BackendSession;
    if (!isValidStoredSession(parsed)) {
      clearStoredBackendSession();
      return null;
    }
    return parsed;
  } catch {
    clearStoredBackendSession();
    return null;
  }
}

export function writeStoredBackendSession(session: BackendSession): void {
  if (typeof window === "undefined") return;
  removeStorageCopy("localStorage");
  try {
    window.sessionStorage.setItem(BACKEND_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // React state still carries the session while the current page remains open.
  }
}

export function clearStoredBackendSession(): void {
  if (typeof window === "undefined") return;
  removeStorageCopy("localStorage");
  removeStorageCopy("sessionStorage");
}

export function isSessionForWallet(session: BackendSession, walletAddress: string): boolean {
  return session.walletAddress.toLowerCase() === walletAddress.toLowerCase();
}

export function isExpiredBackendSessionError(error: unknown): boolean {
  return error instanceof BackendClientError && error.status === 401;
}

function isValidStoredSession(session: BackendSession): boolean {
  if (!session || typeof session.walletAddress !== "string" || typeof session.expiresAt !== "string") {
    return false;
  }
  const expiresAt = new Date(session.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now() + EXPIRY_SAFETY_WINDOW_MS;
}

function removeStorageCopy(storageName: "localStorage" | "sessionStorage"): void {
  try {
    window[storageName].removeItem(BACKEND_SESSION_STORAGE_KEY);
  } catch {
    // Storage access can fail in strict browser privacy modes.
  }
}
