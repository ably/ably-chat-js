/**
 * Generates a random string that can be used as an identifier, for instance, in identifying specific room
 * objects.
 * @returns A random string that can be used as an identifier.
 */
export const randomId = (): string => Math.random().toString(36).slice(2);

const IDEMPOTENCY_KEY_ENTROPY_BYTES = 9;

/**
 * Generates an idempotency key for a single publish attempt.
 * 9 random bytes base64-encoded.
 * @returns A unique idempotency key for one publish attempt.
 */
export const idempotencyKey = (): string => {
  const bytes = new Uint8Array(IDEMPOTENCY_KEY_ENTROPY_BYTES);
  crypto.getRandomValues(bytes);

  // Prefer Uint8Array.prototype.toBase64() where available (Node 22+, modern
  // browsers, recent React Native) — operates directly on bytes. Fall back to
  // btoa for older runtimes where toBase64 isn't yet available.
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64;
  if (typeof native === 'function') {
    return native.call(bytes);
  }
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCodePoint(b);
  }
  return btoa(binary);
};
