import { API, log, wait } from "./helpers.mjs";

export const DEMO = { email: "demo@receptra.ai", password: "demo1234" };

async function req(path, { token, json, method = "POST" } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

export async function login() {
  const { token } = await req("/auth/login", { json: DEMO });
  return token;
}

/** The conversation the offline rule-based agent books deterministically. */
export const BOOKING_TURNS = [
  "Hi, I'd like to book a boiler service tomorrow",
  "The first one is perfect",
  "My name is James Carter",
];

/**
 * Drive a simulated call through the same brain the phone line uses. Each turn
 * publishes SSE transcript events, so the dashboard reacts live while the
 * recording watches it. Returns the call id.
 */
export async function simulateBookingCall(token, { cadenceMs = 2600, onTurn } = {}) {
  const start = await req("/demo/sessions", { token, json: { from_number: "+447700900123" } });
  log(`sim start ${start.call_id}: ${start.reply}`);
  await wait(cadenceMs);
  for (const text of BOOKING_TURNS) {
    const out = await req(`/demo/sessions/${start.call_id}/message`, { token, json: { text } });
    log(`sim > ${text}\nsim < ${out.reply}`);
    onTurn?.(text, out);
    if (out.ended) return start.call_id;
    await wait(cadenceMs);
  }
  const end = await req(`/demo/sessions/${start.call_id}/end`, { token });
  log(`sim end outcome=${end.outcome} summary=${end.summary}`);
  return start.call_id;
}

export async function listCalls(token, params = "") {
  return req(`/calls${params}`, { token, method: "GET" });
}

/** Delete every knowledge document so an upload is the first card on the page. */
export async function clearKnowledge(token) {
  const docs = await req("/knowledge", { token, method: "GET" });
  const list = Array.isArray(docs) ? docs : (docs.items ?? docs.docs ?? []);
  for (const d of list) {
    await req(`/knowledge/${d.id}`, { token, method: "DELETE" });
  }
  log(`cleared ${list.length} knowledge doc(s)`);
}
