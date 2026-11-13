/**
 * Optional passphrase lock for the API key (Web Crypto, no dependencies).
 *
 * PBKDF2-SHA-256 (600,000 iterations) derives an AES-GCM key from the
 * passphrase. This protects the key stored in the browser against someone
 * reading the browser's storage. It does NOT protect against malicious code
 * running inside the unlocked app, and a short numeric PIN can be guessed
 * offline by someone who copies the storage - longer passphrases are better.
 */

export interface EncryptedBlob {
  v: 1;
  salt: string; // base64
  iv: string; // base64
  data: string; // base64
  iterations: number;
}

const ITERATIONS = 600_000;

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(secret: string, passphrase: string): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(secret));
  return { v: 1, salt: toB64(salt), iv: toB64(iv), data: toB64(data), iterations: ITERATIONS };
}

/** Throws if the passphrase is wrong (AES-GCM authentication fails). */
export async function decryptSecret(blob: EncryptedBlob, passphrase: string): Promise<string> {
  const key = await deriveKey(passphrase, fromB64(blob.salt), blob.iterations);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(blob.iv) }, key, fromB64(blob.data));
  return new TextDecoder().decode(plain);
}
