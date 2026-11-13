// unpovdiferente · Intermediario del traductor de consignas con IA (Cloudflare Worker)
//
// La página le manda la consigna; este Worker le pide a la IA que la traduzca y devuelve
// siempre el mismo formato JSON. La clave de la IA vive acá como secreto: nunca llega al navegador.
//
// Configuración (en Cloudflare: Worker → Settings → Variables and Secrets / Bindings):
//   GEMINI_API_KEY     secreto, la clave de Google AI Studio (si PROVIDER = "gemini")
//   ANTHROPIC_API_KEY  secreto, la clave de Claude (si algún día PROVIDER = "claude")
//   LIMITS             base KV para contar las traducciones de cada persona por día
//   PROVIDER           "gemini" (por defecto) o "claude"
//   MODEL              opcional; si no está se usa el de DEFAULT_MODEL
//   DAILY_LIMIT        opcional; traducciones por persona por día (por defecto 10)
//   ALLOWED_ORIGINS    opcional; sitios que pueden usarlo, separados por coma
//
// Cambiar de IA no toca la página: se cambia PROVIDER (y su clave) acá y listo.

// Si un modelo falla (saturado, dado de baja...), se prueba con el siguiente
const DEFAULT_MODEL = { gemini: "gemini-flash-latest,gemini-flash-lite-latest,gemini-2.5-flash", claude: "claude-haiku-5-5" };
const DEFAULT_ORIGINS = "https://alejandroflorido.github.io,https://tdah-unpovdiferente.pages.dev,http://localhost:8000,http://127.0.0.1:8000";
const MAX_CHARS = 5000;

const PROMPT = `Sos un asistente de unpovdiferente, una web para estudiantes universitarios con TDAH o dificultades de aprendizaje.
Te pasan la consigna de un trabajo práctico tal como la escribió el docente. Traducila a algo claro y accionable.

Reglas:
- Español rioplatense, frases cortas y simples, sin tecnicismos. Tuteá con "vos" solo si hace falta.
- "pasos": las acciones a hacer, en orden, cada una empieza con un verbo en infinitivo ("Leer...", "Elegir...", "Diseñar..."). Una acción por paso. Si la consigna nombra una lectura o material previo, eso es el primer paso.
- "como": las condiciones, requisitos o cosas a tener en cuenta (público, materiales, extensión, individual o grupal, estilo...). No repitas lo que ya está en pasos, entrega o evaluación.
- "entrega": formato, soporte y lugar de entrega (PDF, impreso, campus, exposición oral...).
- "se_evalua": los criterios de evaluación que nombra la consigna.
- Fechas: hoy es {HOY} ({DIA_HOY}). Convertí fechas relativas ("el jueves", "la semana que viene", "en 10 días", "20/10") a fecha AAAA-MM-DD. Si un paso tiene su propia fecha, ponela en ese paso. "fecha_entrega" es la fecha final de entrega y "para_cuando" la misma fecha escrita para leer (por ejemplo "jueves 20/11"). Si la consigna habla de "la próxima clase" u otra fecha que no se puede calcular, dejá la fecha vacía y explicala en "para_cuando".
- No inventes nada. Si algo importante no está (fecha, cómo se entrega, qué se evalúa, extensión, si es grupal), dejalo vacío y sumá una pregunta corta para el docente en "preguntar".
- Ignorá saludos, despedidas y frases como "Les dejo la consigna".
- "primer_paso": la acción más chica y concreta para arrancar hoy (menos de 15 minutos).
- Si el texto no es una consigna, devolvé todo vacío y en "preguntar" poné "Esto no parece una consigna. Pegá el texto del trabajo práctico."`;

// Mismo formato para cualquier IA
const SCHEMA = {
  type: "OBJECT",
  properties: {
    pasos: { type: "ARRAY", items: { type: "OBJECT", properties: { texto: { type: "STRING" }, fecha: { type: "STRING", description: "AAAA-MM-DD o vacío" } }, required: ["texto", "fecha"] } },
    como: { type: "ARRAY", items: { type: "STRING" } },
    entrega: { type: "ARRAY", items: { type: "STRING" } },
    se_evalua: { type: "ARRAY", items: { type: "STRING" } },
    fecha_entrega: { type: "STRING", description: "AAAA-MM-DD o vacío" },
    para_cuando: { type: "STRING" },
    primer_paso: { type: "STRING" },
    preguntar: { type: "ARRAY", items: { type: "STRING" } }
  },
  required: ["pasos", "como", "entrega", "se_evalua", "fecha_entrega", "para_cuando", "primer_paso", "preguntar"]
};

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
// Día de hoy en Argentina (UTC-3), para el límite diario y las fechas relativas
function hoyAR() {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return { iso: d.toISOString().slice(0, 10), dia: DIAS[d.getUTCDay()] };
}

async function callGemini(env, model, system, consigna) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: consigna }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: SCHEMA }
    })
  });
  if (!r.ok) throw new Error("gemini " + r.status + " " + (await r.text()).slice(0, 300));
  const data = await r.json();
  const text = (data.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
  if (!text) throw new Error("gemini sin texto: " + JSON.stringify(data).slice(0, 300));
  return leerJson(text);
}

async function callClaude(env, model, system, consigna) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: 2000, temperature: 0.2,
      system: system + "\n\nRespondé SOLO con un objeto JSON con estas claves: pasos (lista de {texto, fecha}), como, entrega, se_evalua, preguntar (listas de textos), fecha_entrega, para_cuando, primer_paso (textos).",
      messages: [{ role: "user", content: consigna }]
    })
  });
  if (!r.ok) throw new Error("claude " + r.status + " " + (await r.text()).slice(0, 300));
  const data = await r.json();
  return leerJson((data.content || []).map((p) => p.text || "").join(""));
}

// Acepta el JSON aunque venga envuelto en ```json ... ``` o con texto alrededor
function leerJson(text) {
  try { return JSON.parse(text); } catch (e) {}
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("respuesta sin JSON: " + text.slice(0, 200));
  return JSON.parse(text.slice(a, b + 1));
}

// Lo que vuelve de la IA se limpia: solo textos cortos, en el formato que espera la página
const str = (v, n = 400) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const strs = (v) => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean).slice(0, 12) : []);
const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : "");
function limpiar(o) {
  o = o && typeof o === "object" ? o : {};
  return {
    pasos: (Array.isArray(o.pasos) ? o.pasos : []).map((p) => (typeof p === "string" ? { texto: str(p), fecha: "" } : { texto: str(p?.texto), fecha: fecha(p?.fecha) })).filter((p) => p.texto).slice(0, 12),
    como: strs(o.como), entrega: strs(o.entrega), se_evalua: strs(o.se_evalua), preguntar: strs(o.preguntar),
    fecha_entrega: fecha(o.fecha_entrega), para_cuando: str(o.para_cuando, 120), primer_paso: str(o.primer_paso)
  };
}

async function hashIp(ip) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("unpov:" + ip));
  return Array.from(new Uint8Array(buf).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = okOrigin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "86400", Vary: "Origin" } : {};
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...cors } });

    if (request.method === "OPTIONS") return new Response(null, { status: okOrigin ? 204 : 403, headers: cors });
    if (request.method === "GET") return json({ ok: true, servicio: "traductor de consignas unpovdiferente" });
    if (request.method !== "POST") return json({ ok: false, error: "metodo" }, 405);
    if (!okOrigin) return json({ ok: false, error: "origen" }, 403);

    let consigna = "";
    try { consigna = str((await request.json()).consigna, MAX_CHARS + 1); } catch (e) {}
    if (consigna.length < 15) return json({ ok: false, error: "vacio" }, 400);
    if (consigna.length > MAX_CHARS) return json({ ok: false, error: "largo" }, 413);

    // Límite por persona por día (por IP, guardada como código, no como dirección)
    const limit = Number(env.DAILY_LIMIT) || 10;
    const hoy = hoyAR();
    const key = "n:" + hoy.iso + ":" + (await hashIp(request.headers.get("CF-Connecting-IP") || "?"));
    const usadas = env.LIMITS ? Number(await env.LIMITS.get(key)) || 0 : 0;
    if (usadas >= limit) return json({ ok: false, error: "limite", restantes: 0 }, 429);

    const provider = env.PROVIDER === "claude" ? "claude" : "gemini";
    const models = (env.MODEL || DEFAULT_MODEL[provider]).split(",").map((m) => m.trim()).filter(Boolean);
    const system = PROMPT.replace("{HOY}", hoy.iso).replace("{DIA_HOY}", hoy.dia);
    let resultado;
    for (const model of models) {
      try {
        const crudo = provider === "claude" ? await callClaude(env, model, system, consigna) : await callGemini(env, model, system, consigna);
        resultado = limpiar(crudo);
        break;
      } catch (e) {
        console.error("Error de la IA (" + model + "): " + String(e && e.message || e));
      }
    }
    if (!resultado) return json({ ok: false, error: "ia" }, 502);
    // Solo cuenta si la traducción salió bien
    if (env.LIMITS) await env.LIMITS.put(key, String(usadas + 1), { expirationTtl: 2 * 86400 });
    return json({ ok: true, restantes: Math.max(0, limit - usadas - 1), resultado });
  }
};
