import type { PushSubscriptionPayload } from "@/lib/backendClient";

const EXPECTED_VAPID_PUBLIC_KEY_LENGTH = 65;
const UNCOMPRESSED_EC_POINT_PREFIX = 0x04;

export type PreparedPushSubscription = {
  applicationServerKey: Uint8Array<ArrayBuffer>;
  existingSubscription: PushSubscription | null;
  registration: ServiceWorkerRegistration;
  vapidPublicKey: string;
};

export async function preparePushSubscription(
  vapidPublicKey: string,
  serviceWorkers: ServiceWorkerContainer = navigator.serviceWorker
): Promise<PreparedPushSubscription> {
  const normalizedPublicKey = vapidPublicKey.trim();
  const applicationServerKey = decodeVapidPublicKey(normalizedPublicKey);
  const registration = await getActiveServiceWorkerRegistration(serviceWorkers);
  let existingSubscription = await registration.pushManager.getSubscription();

  if (
    existingSubscription
    && !subscriptionUsesApplicationServerKey(existingSubscription, applicationServerKey)
  ) {
    await existingSubscription.unsubscribe().catch(() => false);
    existingSubscription = null;
  }

  return {
    applicationServerKey,
    existingSubscription,
    registration,
    vapidPublicKey: normalizedPublicKey
  };
}

export async function subscribeToPreparedPush(
  prepared: PreparedPushSubscription
): Promise<PushSubscription> {
  if (prepared.existingSubscription) return prepared.existingSubscription;

  try {
    const subscription = await prepared.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: prepared.applicationServerKey
    });
    if (subscription) return subscription;
  } catch (error) {
    const recoveredSubscription = await findMatchingSubscription(prepared);
    if (recoveredSubscription) return recoveredSubscription;
    throw new PushSubscriptionSetupError(error);
  }

  const recoveredSubscription = await findMatchingSubscription(prepared);
  if (recoveredSubscription) return recoveredSubscription;
  throw new PushSubscriptionUnavailableError();
}

export function withPushSubscription(
  prepared: PreparedPushSubscription,
  subscription: PushSubscription | null
): PreparedPushSubscription {
  return {
    ...prepared,
    existingSubscription: subscription
  };
}

export function pushSubscriptionToPayload(
  subscription: PushSubscription
): PushSubscriptionPayload {
  const json = subscription.toJSON() as {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: { p256dh?: string; auth?: string };
  };
  const p256dh = json.keys?.p256dh ?? arrayBufferToBase64Url(subscription.getKey("p256dh"));
  const auth = json.keys?.auth ?? arrayBufferToBase64Url(subscription.getKey("auth"));

  if (!json.endpoint || !p256dh || !auth) {
    throw new Error("Push notification setup was incomplete. Please try again.");
  }

  return {
    endpoint: json.endpoint,
    keys: { p256dh, auth },
    expirationTime: json.expirationTime ?? null
  };
}

export class InvalidVapidPublicKeyError extends Error {
  constructor() {
    super("Push notification configuration is invalid.");
    this.name = "InvalidVapidPublicKeyError";
  }
}

export class PushSubscriptionUnavailableError extends Error {
  constructor() {
    super("The browser did not return a push subscription endpoint.");
    this.name = "PushSubscriptionUnavailableError";
  }
}

export class PushSubscriptionSetupError extends Error {
  constructor(cause: unknown) {
    super(normalizeErrorMessage(cause));
    this.name = "PushSubscriptionSetupError";
    this.cause = cause;
  }
}

async function getActiveServiceWorkerRegistration(
  serviceWorkers: ServiceWorkerContainer
): Promise<ServiceWorkerRegistration> {
  const existingRegistration = await serviceWorkers.getRegistration("/");
  const registration = existingRegistration
    ?? await serviceWorkers.register("/sw.js", { scope: "/" });

  if (registration.active) return registration;

  const readyRegistration = await serviceWorkers.ready;
  if (!readyRegistration.active) {
    throw new Error("Push notifications are still getting ready. Please try again.");
  }
  return readyRegistration;
}

async function findMatchingSubscription(
  prepared: PreparedPushSubscription
): Promise<PushSubscription | null> {
  const subscription = await prepared.registration.pushManager.getSubscription().catch(() => null);
  if (!subscription) return null;
  return subscriptionUsesApplicationServerKey(subscription, prepared.applicationServerKey)
    ? subscription
    : null;
}

function decodeVapidPublicKey(value: string): Uint8Array<ArrayBuffer> {
  if (!value) throw new InvalidVapidPublicKeyError();

  try {
    const padding = "=".repeat((4 - (value.length % 4)) % 4);
    const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
    const raw = globalThis.atob(base64);
    const output: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);

    if (
      output.byteLength !== EXPECTED_VAPID_PUBLIC_KEY_LENGTH
      || output[0] !== UNCOMPRESSED_EC_POINT_PREFIX
    ) {
      throw new InvalidVapidPublicKeyError();
    }
    return output;
  } catch (error) {
    if (error instanceof InvalidVapidPublicKeyError) throw error;
    throw new InvalidVapidPublicKeyError();
  }
}

function subscriptionUsesApplicationServerKey(
  subscription: PushSubscription,
  applicationServerKey: Uint8Array<ArrayBuffer>
): boolean {
  const existingKey = subscription.options.applicationServerKey;
  return !existingKey
    || arrayBufferToBase64Url(existingKey) === arrayBufferToBase64Url(applicationServerKey);
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | ArrayBufferView | null): string {
  if (!buffer) return "";
  const bytes = buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer)
    : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === "string" && error ? error : "Push notification setup failed.";
}
