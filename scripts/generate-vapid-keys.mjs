import { createECDH } from "node:crypto";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();

const publicKey = base64Url(ecdh.getPublicKey());
const privateKey = base64Url(ecdh.getPrivateKey());

console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`PUSH_NOTIFICATIONS_ENABLED=true`);
console.log(`PUSH_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`PUSH_VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`PUSH_VAPID_SUBJECT=mailto:alerts@thewallet.app`);

function base64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
