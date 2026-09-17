/**
 * Both Groq and Ollama speak the OpenAI chat-completions shape, so one code
 * path covers them. Adding a provider means adding an entry here, not a new
 * dependency.
 */

const ENDPOINTS = {
  groq: {
    chat: "https://api.groq.com/openai/v1/chat/completions",
    list: "https://api.groq.com/openai/v1/models",
    auth: () => {
      const key = process.env.GROQ_API_KEY;
      if (!key) throw new Error("GROQ_API_KEY is not set — cannot call Groq models.");
      return { Authorization: `Bearer ${key}` };
    }
  },
  ollama: {
    chat: () => `${process.env.OLLAMA_HOST || "http://localhost:11434"}/v1/chat/completions`,
    list: () => `${process.env.OLLAMA_HOST || "http://localhost:11434"}/api/tags`,
    auth: () => ({})
  }
};

const urlOf = (v) => (typeof v === "function" ? v() : v);

/** Strip markdown fences and prose the model wrapped around the query. */
function extractCypher(raw) {
  let s = String(raw || "").trim();
  const fenced = s.match(/```(?:cypher|sql)?\s*([\s\S]*?)```/i);
  if (fenced) s = fenced[1].trim();
  s = s.replace(/^(?:here(?:'s| is)[^\n]*|cypher query:?|query:?)\s*/i, "").trim();
  const kw = s.search(/\b(MATCH|OPTIONAL\s+MATCH|WITH|UNWIND|CALL|RETURN|PROFILE|EXPLAIN)\b/i);
  if (kw > 0) s = s.slice(kw);
  return s.replace(/;+\s*$/, "").trim();
}

async function generate({ provider, model, prompt, question, temperature, maxTokens, timeoutMs }) {
  const ep = ENDPOINTS[provider];
  if (!ep) throw new Error(`Unknown provider "${provider}". Known: ${Object.keys(ENDPOINTS).join(", ")}`);

  const body = {
    model,
    temperature: temperature ?? 0,
    max_tokens: maxTokens ?? 600,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: question }
    ]
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs ?? 60000);
  const started = Date.now();
  try {
    const res = await fetch(urlOf(ep.chat), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ep.auth() },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const ms = Date.now() - started;
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 200);
      try { detail = JSON.parse(text).error?.message || detail; } catch {}
      return { ok: false, cypher: "", raw: "", ms, error: `HTTP ${res.status}: ${detail}` };
    }
    const json = JSON.parse(text);
    const raw = json.choices?.[0]?.message?.content ?? "";
    return { ok: true, cypher: extractCypher(raw), raw, ms, error: "" };
  } catch (err) {
    const ms = Date.now() - started;
    const aborted = err && err.name === "AbortError";
    return {
      ok: false, cypher: "", raw: "", ms,
      error: aborted ? `timed out after ${timeoutMs}ms`
                     : `${provider} unreachable: ${String(err.message || err).slice(0, 160)}`
    };
  } finally {
    clearTimeout(timer);
  }
}

/** What can this machine actually call right now? */
async function discover() {
  const out = {};
  try {
    const res = await fetch(urlOf(ENDPOINTS.groq.list), { headers: ENDPOINTS.groq.auth() });
    const j = await res.json();
    out.groq = res.ok ? (j.data || []).map((m) => m.id).sort()
                      : [`error: ${j.error?.message || res.status}`];
  } catch (e) { out.groq = [`unavailable: ${String(e.message || e).slice(0, 80)}`]; }

  try {
    const res = await fetch(urlOf(ENDPOINTS.ollama.list));
    const j = await res.json();
    out.ollama = (j.models || []).map((m) => m.name).sort();
    if (!out.ollama.length) out.ollama = ["(running, but no models pulled)"];
  } catch (e) {
    out.ollama = [`not running at ${process.env.OLLAMA_HOST || "http://localhost:11434"}`];
  }
  return out;
}

module.exports = { generate, discover, extractCypher, ENDPOINTS };
