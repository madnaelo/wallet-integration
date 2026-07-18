import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendSession } from "@/lib/backendClient";
import {
  clearStoredBackendSession,
  readStoredBackendSession,
  writeStoredBackendSession
} from "@/lib/backendSession";

const STORAGE_KEY = "wallet.swapAssistant.backendSession.v1";
const WALLET = "0x0000000000000000000000000000000000000001";

describe("backend session storage", () => {
  let localStorage: Storage;
  let sessionStorage: Storage;

  beforeEach(() => {
    localStorage = createMemoryStorage();
    sessionStorage = createMemoryStorage();
    vi.stubGlobal("window", { localStorage, sessionStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps sessions in session storage and removes legacy persistent copies", () => {
    localStorage.setItem(STORAGE_KEY, "legacy");
    const session = validSession();

    writeStoredBackendSession(session);

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(readStoredBackendSession()).toEqual(session);
  });

  it("removes malformed or nearly expired sessions", () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...validSession(),
      expiresAt: new Date(Date.now() + 30_000).toISOString()
    }));

    expect(readStoredBackendSession()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("clears session storage even when persistent storage is unavailable", () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(validSession()));
    const blockedLocalStorage = {
      removeItem: () => {
        throw new Error("blocked");
      }
    } as unknown as Storage;
    vi.stubGlobal("window", { localStorage: blockedLocalStorage, sessionStorage });

    clearStoredBackendSession();

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

function validSession(): BackendSession {
  return {
    walletAddress: WALLET,
    accessToken: null,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString()
  };
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    }
  };
}
