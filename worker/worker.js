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
//   STATS              base D1 para las estadísticas de uso (opcional: sin ella no se guardan)
//   STATS_KEY          secreto, la clave del panel de estadísticas (dirección del Worker + /panel)
//
// Cambiar de IA no toca la página: se cambia PROVIDER (y su clave) acá y listo.

// Si un modelo falla (saturado, dado de baja...), se prueba con el siguiente
const DEFAULT_MODEL = { gemini: "gemini-flash-latest,gemini-flash-lite-latest,gemini-pro-latest", claude: "claude-haiku-5-5" };
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

// ---------- Estadísticas de uso (anónimas, solo para el equipo) ----------
// La página manda lotes de eventos a /e. Se guardan en D1 (tabla ev) y el panel (/panel, con clave)
// los muestra sumados. No se guarda IP ni nada que identifique a la persona: solo un código al azar por visita.
const EV_KINDS = ["visita", "disp", "origen", "vista", "entrada", "tiempo", "uso", "ajuste", "descarga", "ia", "sitio"];
let tablaLista = false;
async function prepararTabla(db) {
  if (tablaLista) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS ev (dia TEXT NOT NULL, hora INTEGER, sid TEXT, k TEXT NOT NULL, n TEXT, s INTEGER)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ev_dia ON ev (dia, k)")
  ]);
  tablaLista = true;
}

async function guardarEventos(request, env) {
  let data;
  try { data = JSON.parse((await request.text()).slice(0, 20000)); } catch (e) { return false; }
  const sid = typeof data?.sid === "string" && /^[a-z0-9]{6,16}$/.test(data.sid) ? data.sid : "";
  if (!sid || !Array.isArray(data.ev)) return false;
  const ahora = new Date(Date.now() - 3 * 3600 * 1000);
  const dia = ahora.toISOString().slice(0, 10), hora = ahora.getUTCHours();
  const filas = data.ev.slice(0, 40).filter((e) => Array.isArray(e) && EV_KINDS.includes(e[0])).map((e) => {
    const n = typeof e[1] === "string" ? e[1].replace(/[^\p{L}\p{N} :.¿?_-]/gu, "").slice(0, 60) : "";
    const secs = Number.isFinite(e[2]) ? Math.max(0, Math.min(1800, Math.round(e[2]))) : null;
    return [e[0], n, secs];
  }).filter((f) => f[1]);
  if (!filas.length) return false;
  await prepararTabla(env.STATS);
  const st = env.STATS.prepare("INSERT INTO ev (dia, hora, sid, k, n, s) VALUES (?, ?, ?, ?, ?, ?)");
  await env.STATS.batch(filas.map((f) => st.bind(dia, hora, sid, f[0], f[1], f[2])));
  return true;
}

async function resumen(env, dias) {
  const db = env.STATS;
  await prepararTabla(db);
  const desde = dias > 0 ? new Date(Date.now() - 3 * 3600 * 1000 - (dias - 1) * 86400000).toISOString().slice(0, 10) : "0000-00-00";
  const q = (sql) => db.prepare(sql).bind(desde);
  const W = "WHERE dia >= ?1";
  const r = await db.batch([
    q(`SELECT COUNT(DISTINCT sid) AS visitas, SUM(n = 'nuevo') AS nuevos FROM ev ${W} AND k = 'visita'`),
    q(`SELECT dia, COUNT(DISTINCT sid) AS visitas FROM ev ${W} AND k = 'visita' GROUP BY dia ORDER BY dia`),
    q(`SELECT hora, COUNT(DISTINCT sid) AS visitas FROM ev ${W} AND k = 'visita' GROUP BY hora`),
    q(`SELECT n, COUNT(*) AS vistas, COUNT(DISTINCT sid) AS visitas FROM ev ${W} AND k = 'vista' GROUP BY n`),
    q(`SELECT n, SUM(s) AS segundos FROM ev ${W} AND k = 'tiempo' GROUP BY n`),
    q(`SELECT k, n, COUNT(*) AS veces, COUNT(DISTINCT sid) AS visitas FROM ev ${W} AND k IN ('uso', 'ajuste', 'descarga', 'ia', 'disp', 'origen', 'entrada', 'sitio') GROUP BY k, n ORDER BY veces DESC`),
    q(`SELECT SUM(s) AS t, COUNT(DISTINCT n) AS p FROM ev ${W} AND k IN ('tiempo', 'vista') AND sid IN (SELECT sid FROM ev ${W} AND k = 'visita') GROUP BY sid`)
  ]);
  const rows = (i) => r[i].results || [];
  const porVisita = rows(6);
  const tiempos = porVisita.map((x) => x.t || 0).sort((a, b) => a - b);
  const mediana = tiempos.length ? tiempos[Math.floor(tiempos.length / 2)] : 0;
  const seg = Object.fromEntries(rows(4).map((x) => [x.n, x.segundos || 0]));
  const grupo = (k) => rows(5).filter((x) => x.k === k).map(({ n, veces, visitas }) => ({ n, veces, visitas }));
  return {
    desde, visitas: rows(0)[0]?.visitas || 0, nuevos: rows(0)[0]?.nuevos || 0,
    duracion_mediana: mediana,
    duracion_promedio: tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : 0,
    pestanas_por_visita: porVisita.length ? Math.round(porVisita.reduce((a, x) => a + x.p, 0) / porVisita.length * 10) / 10 : 0,
    por_dia: rows(1), por_hora: rows(2),
    pestanas: rows(3).map((x) => ({ ...x, segundos: seg[x.n] || 0 })).sort((a, b) => b.vistas - a.vistas),
    herramientas: grupo("uso"), ajustes: grupo("ajuste"), descargas: grupo("descarga"), ia: grupo("ia"),
    dispositivos: grupo("disp"), sitios: grupo("sitio"), origenes: grupo("origen"), entradas: grupo("entrada")
  };
}

// Compara la clave sin cortar en el primer carácter distinto
function mismaClave(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
    // Panel y datos de estadísticas: misma dirección del Worker, protegidos por la clave STATS_KEY
    if (path === "/panel" && request.method === "GET") return new Response(PANEL_HTML, { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    if (path === "/stats" && request.method === "GET") {
      const h = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
      const clave = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!env.STATS_KEY || !mismaClave(clave, env.STATS_KEY)) return new Response(JSON.stringify({ ok: false, error: "clave" }), { status: 401, headers: h });
      if (!env.STATS) return new Response(JSON.stringify({ ok: false, error: "sin base" }), { status: 500, headers: h });
      const dias = Math.max(0, Math.min(3650, Number(new URL(request.url).searchParams.get("dias")) || 0));
      return new Response(JSON.stringify({ ok: true, ...(await resumen(env, dias)) }), { headers: h });
    }

    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = okOrigin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "86400", Vary: "Origin" } : {};
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...cors } });

    // Eventos de uso que manda la página (sendBeacon, sin respuesta útil)
    if (path === "/e") {
      if (request.method === "POST" && okOrigin && env.STATS) { try { await guardarEventos(request, env); } catch (e) { console.error("Estadísticas: " + (e && e.message || e)); } }
      return new Response(null, { status: 204, headers: cors });
    }
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
    // Google a veces está saturado (503): se prueban todos los modelos hasta 3 vueltas, con pausas cortas.
    // Un modelo que no existe (404) se deja de probar.
    let pendientes = models.slice();
    for (let vuelta = 0; vuelta < 3 && !resultado && pendientes.length; vuelta++) {
      if (vuelta) await new Promise((ok) => setTimeout(ok, 1500 * vuelta));
      for (const model of pendientes.slice()) {
        try {
          const crudo = provider === "claude" ? await callClaude(env, model, system, consigna) : await callGemini(env, model, system, consigna);
          resultado = limpiar(crudo);
          break;
        } catch (e) {
          const m = String(e && e.message || e);
          console.error("Error de la IA (" + model + ", vuelta " + (vuelta + 1) + "): " + m);
          if (/ 40[0134] /.test(m)) pendientes = pendientes.filter((x) => x !== model);
        }
      }
    }
    if (!resultado) return json({ ok: false, error: "ia" }, 502);
    // Solo cuenta si la traducción salió bien
    if (env.LIMITS) await env.LIMITS.put(key, String(usadas + 1), { expirationTtl: 2 * 86400 });
    return json({ ok: true, restantes: Math.max(0, limit - usadas - 1), resultado });
  }
};

const PANEL_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Estadísticas · unpovdiferente</title>
<style>
:root { --bg: #fff; --fg: #111; --muted: #666; --line: #e6e6e6; --card: #fafafa; --brand: #FF6E2B; --blue: #1D58FE; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #111; --fg: #f2f2f2; --muted: #a0a0a0; --line: #2c2c2c; --card: #191919; } }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 64rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
h1 { font-size: 1.6rem; margin: 0 0 .25rem; } h1 span { color: var(--brand); }
h2 { font-size: 1.05rem; margin: 0 0 .75rem; }
.muted { color: var(--muted); } .small { font-size: .85rem; }
.row { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
button, input { font: inherit; }
button { border: 2px solid var(--brand); background: transparent; color: var(--fg); border-radius: 999px; padding: .35rem .9rem; cursor: pointer; }
button[aria-pressed="true"], button.main { background: var(--brand); color: #000; }
input { border: 2px solid var(--line); background: var(--bg); color: var(--fg); border-radius: .6rem; padding: .45rem .7rem; min-width: 14rem; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: .75rem; margin: 1.25rem 0; }
.kpi, .box { background: var(--card); border: 1px solid var(--line); border-radius: 1rem; padding: 1rem; }
.kpi b { display: block; font-size: 1.9rem; line-height: 1.1; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr)); gap: .75rem; }
.box.wide { grid-column: 1 / -1; }
table { width: 100%; border-collapse: collapse; font-size: .92rem; }
th, td { text-align: left; padding: .4rem .3rem; border-bottom: 1px solid var(--line); vertical-align: middle; }
th { font-weight: 600; color: var(--muted); font-size: .8rem; } td.num, th.num { text-align: right; white-space: nowrap; }
.bar { height: .55rem; background: var(--blue); border-radius: 999px; min-width: 2px; }
.bar.o { background: var(--brand); }
.list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .1rem .75rem; padding: .3rem 0; }
.list li .bar { grid-column: 1 / -1; }
.list { list-style: none; margin: 0; padding: 0; }
.days { display: flex; align-items: flex-end; gap: 2px; height: 8rem; border-bottom: 1px solid var(--line); }
.days div { flex: 1; background: var(--blue); border-radius: 3px 3px 0 0; min-height: 1px; position: relative; }
.days div:hover { background: var(--brand); }
.err { color: #d33; }
.scroll { overflow-x: auto; }
</style>
</head>
<body>
<main>
  <h1>Estadísticas <span>unpovdiferente</span></h1>
  <p class="muted small">Solo para el equipo. Datos anónimos: no hay nombres, mails ni direcciones, solo visitas contadas.</p>

  <form id="login" class="row" hidden>
    <input id="key" type="password" placeholder="Clave del panel" autocomplete="current-password" required>
    <button class="main" type="submit">Entrar</button>
    <span id="login-msg" class="err small"></span>
  </form>

  <div id="app" hidden>
    <div class="row" role="group" aria-label="Período">
      <button type="button" data-d="7">7 días</button>
      <button type="button" data-d="30">30 días</button>
      <button type="button" data-d="90">90 días</button>
      <button type="button" data-d="0">Todo</button>
      <span class="muted small" id="status"></span>
      <button type="button" id="logout" style="margin-left:auto">Salir</button>
    </div>
    <div class="kpis" id="kpis"></div>
    <div class="grid">
      <section class="box wide"><h2>Visitas por día</h2><div class="days" id="days"></div><p class="small muted" id="days-cap"></p></section>
      <section class="box wide"><h2>Pestañas</h2><div class="scroll"><table id="tabs"></table></div>
        <p class="small muted">«Abierta en» = de cada 100 visitas, cuántas entraron a esa pestaña. El tiempo cuenta solo mientras la página está a la vista (máx. 30 min seguidos).</p></section>
      <section class="box"><h2>Herramientas y botones</h2><ul class="list" id="tools"></ul></section>
      <section class="box"><h2>Imprimibles descargados</h2><ul class="list" id="dls"></ul></section>
      <section class="box"><h2>Traductor con IA</h2><ul class="list" id="ia"></ul></section>
      <section class="box"><h2>Ajustes de lectura</h2><ul class="list" id="prefs"></ul></section>
      <section class="box"><h2>Por qué pestaña entran</h2><ul class="list" id="entry"></ul></section>
      <section class="box"><h2>Dispositivo</h2><ul class="list" id="dev"></ul></section>
      <section class="box"><h2>Qué link usan</h2><ul class="list" id="site"></ul></section>
      <section class="box"><h2>De dónde llegan</h2><ul class="list" id="ref"></ul></section>
      <section class="box"><h2>Hora del día (Argentina)</h2><div class="days" id="hours" style="height:5rem"></div><p class="small muted">De 0 a 23 h.</p></section>
    </div>
  </div>
</main>
<script>
(function () {
  var TABS = { inicio: "Inicio", entender: "Entender", consignas: "Consignas", herramientas: "Herramientas", descargables: "Imprimibles", docentes: "Docentes", apoyo: "Apoyo", contacto: "Contacto", equipo: "Equipo" };
  var IA = { ok: "Salió bien", ia: "Falló (usó el automático)", limite: "Llegó al límite del día", largo: "Consigna muy larga", vacio: "Sin consigna" };
  var DEV = { celular: "Celular", tablet: "Tablet", compu: "Computadora" };
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var key = ""; try { key = localStorage.getItem("unpov.key") || ""; } catch (e) {}
  var dias = 30; try { dias = Number(localStorage.getItem("unpov.dias") || 30); } catch (e) {}
  function dur(s) {
    s = Math.round(s || 0);
    if (s < 60) return s + " s";
    if (s < 3600) return Math.floor(s / 60) + " min " + (s % 60 ? (s % 60) + " s" : "");
    return Math.floor(s / 3600) + " h " + Math.round((s % 3600) / 60) + " min";
  }
  function list(el, items, label, orange) {
    if (!items.length) { el.innerHTML = '<li class="muted small">Todavía sin datos.</li>'; return; }
    var max = Math.max.apply(null, items.map(function (x) { return x.veces; }));
    el.innerHTML = items.map(function (x) {
      return "<li><span>" + esc(label ? (label[x.n] || x.n) : x.n) + '</span><span class="muted small">' + x.veces + (x.visitas !== x.veces ? " · en " + x.visitas + " visitas" : "") + '</span><div class="bar' + (orange ? " o" : "") + '" style="width:' + (100 * x.veces / max) + '%"></div></li>';
    }).join("");
  }
  function render(d) {
    var v = d.visitas || 0;
    $("#kpis").innerHTML = [
      ["Visitas", v],
      ["Personas nuevas", d.nuevos + (v ? ' <small class="muted small">(' + Math.round(100 * d.nuevos / v) + " %)</small>" : "")],
      ["Duración típica", dur(d.duracion_mediana) + '<small class="muted small"> promedio ' + dur(d.duracion_promedio) + "</small>"],
      ["Pestañas por visita", d.pestanas_por_visita]
    ].map(function (k) { return '<div class="kpi"><span class="muted small">' + k[0] + "</span><b>" + k[1] + "</b></div>"; }).join("");
    // Días: completa los que no tuvieron visitas
    var map = {}; d.por_dia.forEach(function (x) { map[x.dia] = x.visitas; });
    var keys = Object.keys(map).sort(), out = [];
    if (keys.length) {
      var a = new Date((dias ? d.desde : keys[0]) + "T12:00:00Z"), hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
      for (var k = ""; k < hoy; a.setUTCDate(a.getUTCDate() + 1)) { k = a.toISOString().slice(0, 10); out.push([k, map[k] || 0]); }
    }
    var mx = Math.max.apply(null, out.map(function (x) { return x[1]; }).concat([1]));
    $("#days").innerHTML = out.map(function (x) { return '<div title="' + x[0].split("-").reverse().join("/") + ": " + x[1] + ' visitas" style="height:' + (100 * x[1] / mx) + '%"></div>'; }).join("");
    $("#days-cap").textContent = out.length ? "Del " + out[0][0].split("-").reverse().join("/") + " a hoy. Pasá el mouse por una barra para ver el día." : "Todavía sin visitas.";
    var hrs = []; for (var h = 0; h < 24; h++) hrs.push(0);
    d.por_hora.forEach(function (x) { hrs[x.hora] = x.visitas; });
    var mh = Math.max.apply(null, hrs.concat([1]));
    $("#hours").innerHTML = hrs.map(function (n, h) { return '<div title="' + h + " h: " + n + ' visitas" style="height:' + (100 * n / mh) + '%"></div>'; }).join("");
    // Pestañas
    var mt = Math.max.apply(null, d.pestanas.map(function (x) { return x.segundos; }).concat([1]));
    $("#tabs").innerHTML = '<tr><th>Pestaña</th><th class="num">Vistas</th><th class="num">Abierta en</th><th class="num">Tiempo promedio</th><th class="num">Tiempo total</th><th style="width:22%"></th></tr>'
      + (d.pestanas.length ? d.pestanas.map(function (x) {
        return "<tr><td>" + esc(TABS[x.n] || x.n) + '</td><td class="num">' + x.vistas + '</td><td class="num">' + (v ? Math.round(100 * x.visitas / v) : 0) + ' %</td><td class="num">' + dur(x.segundos / x.vistas) + '</td><td class="num">' + dur(x.segundos) + '</td><td><div class="bar" style="width:' + (100 * x.segundos / mt) + '%"></div></td></tr>';
      }).join("") : '<tr><td colspan="6" class="muted small">Todavía sin datos.</td></tr>');
    list($("#tools"), d.herramientas, null, true);
    list($("#dls"), d.descargas);
    list($("#ia"), d.ia, IA);
    list($("#prefs"), d.ajustes.map(function (x) { return { n: x.n.replace(/^ajuste: /, ""), veces: x.veces, visitas: x.visitas }; }));
    list($("#entry"), d.entradas, TABS);
    list($("#dev"), d.dispositivos, DEV);
    list($("#site"), d.sitios || [], { github: "GitHub (alejandroflorido.github.io)", cloudflare: "Cloudflare (tdah-unpovdiferente.pages.dev)", otro: "Otro" });
    list($("#ref"), d.origenes, { directo: "Directo (link, QR o escrito a mano)" });
  }
  function load() {
    document.querySelectorAll("[data-d]").forEach(function (b) { b.setAttribute("aria-pressed", String(Number(b.dataset.d) === dias)); });
    $("#status").textContent = "Cargando…";
    fetch("/stats?dias=" + dias, { headers: { Authorization: "Bearer " + key } }).then(function (r) { return r.json().then(function (j) { return [r.status, j]; }); }).then(function (res) {
      if (res[0] === 401) { showLogin("Clave incorrecta."); return; }
      if (res[1].error === "sin base") { showLogin("La clave está bien, pero falta conectar la base D1 (STATS) al Worker."); return; }
      if (!res[1].ok) { $("#status").textContent = "Error: " + (res[1].error || res[0]); return; }
      if (!Array.isArray(res[1].pestanas)) { showLogin("El Worker todavía responde con la versión vieja. Esperá un minuto y recargá la página."); return; }
      $("#login").hidden = true; $("#app").hidden = false;
      render(res[1]);
      $("#status").textContent = "Actualizado " + new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    }).catch(function () { $("#status").textContent = "No se pudo conectar."; });
  }
  function showLogin(msg) {
    $("#app").hidden = true; $("#login").hidden = false; $("#login-msg").textContent = msg || ""; $("#key").focus();
  }
  $("#login").addEventListener("submit", function (e) {
    e.preventDefault(); key = $("#key").value.trim();
    try { localStorage.setItem("unpov.key", key); } catch (err) {}
    load();
  });
  document.querySelectorAll("[data-d]").forEach(function (b) { b.addEventListener("click", function () {
    dias = Number(b.dataset.d); try { localStorage.setItem("unpov.dias", dias); } catch (e) {} load();
  }); });
  $("#logout").addEventListener("click", function () { key = ""; try { localStorage.removeItem("unpov.key"); } catch (e) {} showLogin(); });
  if (key) load(); else showLogin();
})();
</script>
</body>
</html>
`;
