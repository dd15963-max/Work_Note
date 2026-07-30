import { env } from "cloudflare:workers";

function encryptionKeyBytes(): Uint8Array {
  const value = String(env.GOOGLE_TOKEN_ENCRYPTION_KEY || "").trim();
  if (!value) throw new Error("Google Drive 토큰 암호화 키가 설정되지 않았습니다.");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("Google Drive 토큰 암호화 키는 32바이트여야 합니다.");
  return bytes;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function encryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", arrayBuffer(encryptionKeyBytes()), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: string): Promise<string> {
  if (!value) return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string): Promise<string> {
  if (!value) return "";
  const [version, encodedIv, encodedValue] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedValue) {
    throw new Error("저장된 Google Drive 인증 정보 형식이 올바르지 않습니다.");
  }
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: arrayBuffer(decodeBase64Url(encodedIv)) },
    await encryptionKey(),
    arrayBuffer(decodeBase64Url(encodedValue)),
  );
  return new TextDecoder().decode(decrypted);
}
