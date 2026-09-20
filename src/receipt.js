// A receipt is the Worker's signed statement of what Jev actually answered.
// The browser hands it back with a vote, so a vote can never claim a verdict
// that Jev did not produce, and we never have to trust client-sent model output.
const enc = new TextEncoder();
const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s) => {
  const p = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
};

const keyFor = (secret) =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export async function sign(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify({ ...payload, iat: Date.now() })));
  const sig = await crypto.subtle.sign("HMAC", await keyFor(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

/** Returns the payload, or null if the receipt is forged, malformed or older than maxAgeMs. */
export async function verify(receipt, secret, maxAgeMs = 2 * 60 * 60 * 1000) {
  if (typeof receipt !== "string" || !receipt.includes(".")) return null;
  const [body, sig] = receipt.split(".", 2);
  let ok = false;
  try { ok = await crypto.subtle.verify("HMAC", await keyFor(secret), unb64url(sig), enc.encode(body)); }
  catch { return null; }
  if (!ok) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(unb64url(body))); } catch { return null; }
  if (!payload?.iat || Date.now() - payload.iat > maxAgeMs) return null;
  return payload;
}
