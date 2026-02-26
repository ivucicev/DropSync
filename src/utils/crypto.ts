/**
 * Utility for End-to-End Encryption using Web Crypto API
 */

const ITERATIONS = 100000;
const SALT = new TextEncoder().encode("dropsync-p2p-salt"); // In a real app, this might be unique per room

async function deriveKey(password: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: SALT,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptChunk(data: Uint8Array, password: string): Promise<Uint8Array> {
  const key = await deriveKey(password);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedContent = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    data
  );

  // Combine IV and encrypted content
  const result = new Uint8Array(iv.length + encryptedContent.byteLength);
  result.set(iv);
  result.set(new Uint8Array(encryptedContent), iv.length);
  return result;
}

export async function decryptChunk(encryptedData: Uint8Array, password: string): Promise<Uint8Array> {
  const key = await deriveKey(password);
  const iv = encryptedData.slice(0, 12);
  const content = encryptedData.slice(12);

  const decryptedContent = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    content
  );

  return new Uint8Array(decryptedContent);
}
