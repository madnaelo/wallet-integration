import { describe, expect, it, vi } from "vitest";
import {
  InvalidVapidPublicKeyError,
  PushSubscriptionSetupError,
  preparePushSubscription,
  pushSubscriptionToPayload,
  subscribeToPreparedPush
} from "@/lib/pushNotifications";

const VALID_VAPID_KEY = Buffer.concat([Buffer.from([0x04]), Buffer.alloc(64, 7)]).toString("base64url");

describe("push notification subscriptions", () => {
  it("rejects malformed VAPID keys before registering a service worker", async () => {
    const serviceWorkers = createServiceWorkerContainer();

    await expect(preparePushSubscription("not-a-key", serviceWorkers.container))
      .rejects.toBeInstanceOf(InvalidVapidPublicKeyError);
    expect(serviceWorkers.getRegistration).not.toHaveBeenCalled();
    expect(serviceWorkers.register).not.toHaveBeenCalled();
  });

  it("reuses an active worker and matching subscription during preparation", async () => {
    const subscription = createPushSubscription(decodeVapidKey(VALID_VAPID_KEY));
    const serviceWorkers = createServiceWorkerContainer(subscription);

    const prepared = await preparePushSubscription(VALID_VAPID_KEY, serviceWorkers.container);

    expect(prepared.existingSubscription).toBe(subscription);
    expect(serviceWorkers.register).not.toHaveBeenCalled();
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it("cleans up a subscription created with a previous VAPID key", async () => {
    const previousKey = new Uint8Array(65);
    previousKey[0] = 0x04;
    const subscription = createPushSubscription(previousKey);
    const serviceWorkers = createServiceWorkerContainer(subscription);

    const prepared = await preparePushSubscription(VALID_VAPID_KEY, serviceWorkers.container);

    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(prepared.existingSubscription).toBeNull();
  });

  it("subscribes exactly once using the prepared registration", async () => {
    const serviceWorkers = createServiceWorkerContainer();
    const prepared = await preparePushSubscription(VALID_VAPID_KEY, serviceWorkers.container);
    const subscription = createPushSubscription(prepared.applicationServerKey);
    serviceWorkers.subscribe.mockResolvedValue(subscription);

    await expect(subscribeToPreparedPush(prepared)).resolves.toBe(subscription);
    expect(serviceWorkers.subscribe).toHaveBeenCalledOnce();
    expect(serviceWorkers.register).not.toHaveBeenCalled();
  });

  it("does not reset or repeatedly subscribe when the browser push service fails", async () => {
    const serviceWorkers = createServiceWorkerContainer();
    const prepared = await preparePushSubscription(VALID_VAPID_KEY, serviceWorkers.container);
    serviceWorkers.subscribe.mockRejectedValue(new DOMException(
      "Registration failed - push service error",
      "AbortError"
    ));

    await expect(subscribeToPreparedPush(prepared)).rejects.toBeInstanceOf(PushSubscriptionSetupError);
    expect(serviceWorkers.subscribe).toHaveBeenCalledOnce();
    expect(serviceWorkers.register).not.toHaveBeenCalled();
  });

  it("recovers a matching endpoint if the browser created it before rejecting", async () => {
    const serviceWorkers = createServiceWorkerContainer();
    const prepared = await preparePushSubscription(VALID_VAPID_KEY, serviceWorkers.container);
    const subscription = createPushSubscription(prepared.applicationServerKey);
    serviceWorkers.subscribe.mockRejectedValue(new DOMException("Interrupted", "AbortError"));
    serviceWorkers.getSubscription.mockResolvedValue(subscription);

    await expect(subscribeToPreparedPush(prepared)).resolves.toBe(subscription);
    expect(serviceWorkers.subscribe).toHaveBeenCalledOnce();
  });

  it("serializes the endpoint and encryption keys for backend persistence", () => {
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/test",
      expirationTime: null,
      getKey: vi.fn(),
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
        expirationTime: null,
        keys: { p256dh: "public-key", auth: "auth-secret" }
      })
    } as unknown as PushSubscription;

    expect(pushSubscriptionToPayload(subscription)).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/test",
      expirationTime: null,
      keys: { p256dh: "public-key", auth: "auth-secret" }
    });
  });
});

function createServiceWorkerContainer(existingSubscription: PushSubscription | null = null) {
  const getSubscription = vi.fn().mockResolvedValue(existingSubscription);
  const subscribe = vi.fn();
  const registration = {
    active: { state: "activated" },
    pushManager: { getSubscription, subscribe }
  } as unknown as ServiceWorkerRegistration;
  const getRegistration = vi.fn().mockResolvedValue(registration);
  const register = vi.fn().mockResolvedValue(registration);
  const container = {
    getRegistration,
    ready: Promise.resolve(registration),
    register
  } as unknown as ServiceWorkerContainer;
  return { container, getRegistration, getSubscription, register, registration, subscribe };
}

function createPushSubscription(applicationServerKey: Uint8Array): PushSubscription {
  return {
    endpoint: "https://fcm.googleapis.com/fcm/send/test",
    options: { applicationServerKey: applicationServerKey.buffer, userVisibleOnly: true },
    unsubscribe: vi.fn().mockResolvedValue(true)
  } as unknown as PushSubscription;
}

function decodeVapidKey(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}
