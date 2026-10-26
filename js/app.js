(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("cc." + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("cc." + k, JSON.stringify(v)); } catch (e) {} }
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const fromIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const daysBetween = (a, b) => Math.round((b - a) / 86400000);
  const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  async function copyText(text, msgEl) {
    try { await navigator.clipboard.writeText(text); if (msgEl) msgEl.textContent = "Copiado."; }
    catch (e) { if (msgEl) msgEl.textContent = "No se pudo copiar automáticamente. Seleccioná el texto de la tarjeta."; }
    if (msgEl) setTimeout(() => { msgEl.textContent = ""; }, 3000);
  }

  /* ---------- Ajustes de lectura ---------- */
  const root = document.documentElement;
  const sizes = [["", "normal"], ["t-lg", "grande"], ["t-xl", "muy grande"]];
  let prefs = store.get("prefs", { size: 0, spaced: false, calm: false });
  // Mientras la persona no elija, "Sin animaciones" sigue lo que pide el sistema
  // (menos movimiento). Si toca el botón, manda su elección.
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const isCalm = () => (prefs.calmSet ? prefs.calm : reduceMotion.matches);
  reduceMotion.addEventListener?.("change", () => applyPrefs());
  // Modo oscuro: mientras la persona no elija, sigue al sistema; si toca el interruptor, manda su elección.
  const darkSystem = window.matchMedia("(prefers-color-scheme: dark)");
  const isDark = () => (prefs.theme ? prefs.theme === "dark" : darkSystem.matches);
  darkSystem.addEventListener?.("change", () => applyPrefs());
  function applyPrefs() {
    if (prefs.theme) root.dataset.theme = prefs.theme; else delete root.dataset.theme;
    $("#pref-theme").setAttribute("aria-checked", isDark());
    root.classList.remove("t-lg", "t-xl");
    if (sizes[prefs.size][0]) root.classList.add(sizes[prefs.size][0]);
    root.classList.toggle("spaced", prefs.spaced);
    root.classList.toggle("calm", isCalm());
    $("#pref-size").textContent = "Texto: " + sizes[prefs.size][1];
    $("#pref-space").setAttribute("aria-pressed", prefs.spaced);
    $("#pref-calm").setAttribute("aria-pressed", isCalm());
    store.set("prefs", prefs);
  }
  $("#pref-size").onclick = () => { prefs.size = (prefs.size + 1) % sizes.length; applyPrefs(); };
  $("#pref-space").onclick = () => { prefs.spaced = !prefs.spaced; applyPrefs(); };
  $("#pref-theme").onclick = () => { prefs.theme = isDark() ? "light" : "dark"; applyPrefs(); };
  $("#pref-calm").onclick = () => { prefs.calm = !isCalm(); prefs.calmSet = true; applyPrefs(); };
  applyPrefs();

  /* ---------- Cursor ---------- */
  // Rastro: los últimos puntos del recorrido (menos de un quinto de segundo y, como mucho,
  // unos 70px) se dibujan como una raya de marcador que se va borrando desde la cola.
  // Con "Sin animaciones" no hay rastro ni garabato.
  const trail = document.createElement("canvas");
  trail.className = "cur-trail"; trail.setAttribute("aria-hidden", "true");
  document.body.appendChild(trail);
  const tctx = trail.getContext("2d");
  let pts = [], trailRaf = 0;
  const TRAIL_MS = 180, TRAIL_PX = 70;
  function sizeTrail() {
    const r = window.devicePixelRatio || 1;
    trail.width = innerWidth * r; trail.height = innerHeight * r;
    tctx.setTransform(r, 0, 0, r, 0, 0);
  }
  sizeTrail();
  window.addEventListener("resize", sizeTrail);
  // Garabato en reposo: apenas el mouse se frena (el navegador avisa del movimiento cada ~16 ms, así que
  // 120 ms sin avisos ya es "quieto"), la punta garabatea rápido y sin patrón alrededor de ese punto
  // durante medio segundo. Rastro y garabato son un mismo trazo: cuando el garabato termina, o cuando
  // el mouse se vuelve a mover, la punta se levanta y la cola recorre el garabato hasta alcanzarla
  // (como un trazo que se termina de dibujar) y, si el mouse se movió, sigue de largo por el rastro nuevo.
  const IDLE_MS = 120, DOODLE_MS = 500, DOODLE_R = 16, DOODLE_PX = 220;
  let last = null, idleTimer = 0, doodle = null, capPx = TRAIL_PX, lastFrame = performance.now();
  function startDoodle() {
    if (!last || doodle || isCalm()) return;
    doodle = { x: last.x, y: last.y, t0: performance.now(), px: last.x, py: last.y, dir: Math.random() * Math.PI * 2, spin: 0 };
    if (!trailRaf) trailRaf = requestAnimationFrame(drawTrail);
  }
  function stepDoodle(now) {
    if (now - doodle.t0 > DOODLE_MS) { doodle = null; return; }
    // La punta avanza rápido y cambia de giro al azar: rulos, zigzags y vueltas atrás, como una birome
    // nerviosa. Si se aleja demasiado, vuelve hacia donde quedó el mouse.
    const d = doodle;
    if (Math.random() < 0.12) d.spin = (Math.random() - 0.5) * 1.6;
    if (Math.random() < 0.04) d.dir += Math.PI * (0.6 + Math.random() * 0.8);
    d.dir += d.spin + (Math.random() - 0.5) * 0.5;
    const dx = d.x - d.px, dy = d.y - d.py;
    if (Math.hypot(dx, dy) > DOODLE_R) d.dir = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.2;
    const step = 4 + Math.random() * 4;
    d.px += Math.cos(d.dir) * step; d.py += Math.sin(d.dir) * step;
    pts.push({ x: d.px, y: d.py, t: now, doodle: true });
  }
  const pathLength = (list, from = 0) => {
    let len = 0;
    for (let i = from + 1; i < list.length; i++) len += Math.hypot(list[i].x - list[i - 1].x, list[i].y - list[i - 1].y);
    return len;
  };
  function drawTrail() {
    const now = performance.now();
    if (isCalm()) { pts = []; doodle = null; }
    if (doodle) stepDoodle(now);
    // La cola se come el trazo desde el principio, siempre de a poco para que no haya saltos:
    // mientras la punta garabatea, la cola la sigue a DOODLE_PX; cuando la punta se levanta,
    // la cola avanza rápido por el garabato y después sigue por el rastro.
    if (doodle) { while (pts.length > 2 && pathLength(pts) > DOODLE_PX) pts.shift(); }
    else if (pts.length && pts[0].doodle) {
      // La cola recorre el garabato a ~900 px/s (unos 0,25 s en total), sin importar la frecuencia de la pantalla.
      let eat = 0.9 * Math.min(now - lastFrame, 50);
      while (eat > 0 && pts.length > 1 && pts[0].doodle) { eat -= Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y); pts.shift(); }
      if (pts.length === 1 && pts[0].doodle) pts.shift();
    }
    else for (let k = 0; k < 2 && pts.length && now - pts[0].t > TRAIL_MS; k++) pts.shift();
    // Largo máximo visible: el del garabato mientras quede algo de él; después baja de a poco al del rastro.
    const target = pts.some((p) => p.doodle) ? DOODLE_PX : TRAIL_PX;
    capPx = target > capPx ? target : Math.max(target, capPx - 0.9 * Math.min(now - lastFrame, 50));
    lastFrame = now;
    let len = 0, from = pts.length - 1;
    while (from > 0 && len < capPx) { len += Math.hypot(pts[from].x - pts[from - 1].x, pts[from].y - pts[from - 1].y); from--; }
    tctx.clearRect(0, 0, innerWidth, innerHeight);
    tctx.strokeStyle = getComputedStyle(root).getPropertyValue("--brand-2").trim();
    tctx.lineCap = "round"; tctx.lineJoin = "round";
    tctx.globalAlpha = 0.8; tctx.lineWidth = 3;
    const shown = pts.slice(Math.max(from, 0));
    if (shown.length > 1) {
      tctx.beginPath();
      shown.forEach((p, i) => (i ? tctx.lineTo(p.x, p.y) : tctx.moveTo(p.x, p.y)));
      tctx.stroke();
    }
    trailRaf = pts.length || doodle ? requestAnimationFrame(drawTrail) : 0;
  }
  document.addEventListener("pointermove", (e) => {
    // Solo con mouse o lápiz: en compus con pantalla táctil el mouse también cuenta, aunque el sistema diga "táctil".
    if (e.pointerType === "touch" || isCalm()) return;
    last = { x: e.clientX, y: e.clientY };
    doodle = null; // la punta se levanta del garabato y el trazo sigue con el mouse
    pts.push({ ...last, t: performance.now() });
    if (!trailRaf) trailRaf = requestAnimationFrame(drawTrail);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(startDoodle, IDLE_MS);
  }, { passive: true });
  // Al salir de la ventana no nace un garabato nuevo; lo que está dibujado se termina de recorrer.
  document.addEventListener("mouseleave", () => { clearTimeout(idleTimer); last = null; doodle = null; });

  /* ---------- Pestañas ---------- */
  function setupTabs(tabs, onSelect) {
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => onSelect(t));
      t.addEventListener("keydown", (e) => {
        let j = null;
        if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
        if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
        if (e.key === "Home") j = 0;
        if (e.key === "End") j = tabs.length - 1;
        if (j !== null) { e.preventDefault(); tabs[j].focus(); onSelect(tabs[j]); }
      });
    });
  }
  function selectIn(tabs, tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      const p = document.getElementById(t.getAttribute("aria-controls"));
      if (p) p.hidden = !on;
    });
  }
  /* ---------- Navegación del encabezado ----------
     Cada bloque es una pestaña: se muestra una sección por vez y el resto queda oculto.
     La dirección (#seccion) cambia con cada pestaña, así funcionan Atrás y los enlaces. */
  const mainTabs = $$(".tabs .tab");
  const sectionIds = mainTabs.map((t) => t.getAttribute("href").slice(1));
  const sections = sectionIds.map((id) => document.getElementById(id));
  sections.forEach((sec) => { sec.tabIndex = -1; });
  let currentTab = null;
  function markTab(id) {
    mainTabs.forEach((t) => {
      const on = t.getAttribute("href") === "#" + id;
      if (on) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
      if (on) {
        const nav = t.parentElement;
        if (t.offsetLeft < nav.scrollLeft) nav.scrollLeft = t.offsetLeft - 16;
        else if (t.offsetLeft + t.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = t.offsetLeft + t.offsetWidth - nav.clientWidth + 16;
      }
    });
  }
  // Muestra la pestaña y vuelve al comienzo de la página (sin desplazamiento animado).
  // Con focus, el lector de pantalla y el teclado arrancan desde la sección nueva.
  function goTab(id, focus) {
    if (!sectionIds.includes(id)) return;
    sections.forEach((sec) => { sec.hidden = sec.id !== id; sec.classList.remove("entering"); });
    // La transición solo corre al cambiar de pestaña (no al cargar) y nunca con "Sin animaciones".
    if (currentTab && currentTab !== id && !isCalm()) {
      const sec = document.getElementById(id);
      void sec.offsetWidth;
      sec.classList.add("entering");
    }
    markTab(id);
    window.scrollTo(0, 0);
    if (focus) document.getElementById(id).focus({ preventScroll: true });
    if (currentTab && currentTab !== id && location.hash.slice(1) !== id) history.pushState(null, "", "#" + id);
    currentTab = id;
    document.title = id === "inicio" ? baseTitle : mainTabs[sectionIds.indexOf(id)].firstChild.textContent.trim() + " · " + baseTitle;
  }
  const baseTitle = document.title;
  mainTabs.forEach((t) => t.addEventListener("click", (e) => {
    e.preventDefault();
    goTab(t.getAttribute("href").slice(1), true);
  }));
  // Atrás / Adelante del navegador y enlaces con #seccion.
  function fromHash() {
    const h = (location.hash || "").slice(1);
    if (!h || sectionIds.includes(h)) goTab(h || "inicio", false);
  }
  window.addEventListener("popstate", fromHash);
  window.addEventListener("hashchange", fromHash);
  // Enlace a la pestaña siguiente al final de cada sección.
  sections.forEach((sec, i) => {
    const next = mainTabs[i + 1];
    if (!next) return;
    const box = document.createElement("div");
    box.className = "next-tab";
    box.innerHTML = '<a href="' + next.getAttribute("href") + '" data-go="' + sectionIds[i + 1] + '"><small>Siguiente</small><span>' + esc(next.firstChild.textContent.trim()) + ' →</span></a>';
    sec.appendChild(box);
  });

  const subTabs = $$(".subtabs .subtab");
  // Las herramientas usan la misma transición que las pestañas (nunca con "Sin animaciones").
  let currentSub = null;
  function goSub(key) {
    const t = subTabs.find((x) => x.id === "st-" + key);
    if (!t) return;
    selectIn(subTabs, t);
    $("#tool-semana").style.display = key === "semana" ? "flex" : "none";
    const panel = document.getElementById(t.getAttribute("aria-controls"));
    subTabs.forEach((x) => document.getElementById(x.getAttribute("aria-controls")).classList.remove("entering"));
    if (currentSub && currentSub !== key && !isCalm()) { void panel.offsetWidth; panel.classList.add("entering"); }
    currentSub = key;
    store.set("sub", key);
  }
  setupTabs(subTabs, (t) => goSub(t.id.replace("st-", "")));

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-go]");
    if (!b) return;
    e.preventDefault();
    goTab(b.dataset.go, true);
    if (b.dataset.sub) goSub(b.dataset.sub);
    if (b.dataset.sub === "bloques") setPreset(10);
  });

  /* ---------- Carrusel de situaciones ---------- */
  const situations = [
    { q: "No es que no escuché. Perdí el hilo.", t: "Atención sostenida", x: "En una clase larga la atención va y viene sin que lo decidas. Tener la consigna por escrito y una estructura fija para tomar apuntes ayuda a retomar.", l: ["Ver cómo desarmar una consigna", "consignas"] },
    { q: "Sé que tengo que hacerlo. No sé por dónde empezar.", t: "Iniciar tareas", x: "No es falta de interés. Empezar una tarea es una función ejecutiva, y cuesta más cuando la tarea es grande y difusa. Achicar el primer paso destraba.", l: ["Usar Primer paso", "herramientas", "primer"] },
    { q: "La entrega es en dos semanas y todavía no puedo empezar.", t: "Percepción del tiempo", x: "El tiempo lejano se siente abstracto. Ver los días que faltan y tener fechas intermedias lo vuelve concreto.", l: ["Armar mi semana", "herramientas", "semana"] },
    { q: "Entendí la consigna, pero no sé cómo organizarla.", t: "Planificación", x: "Entender qué hay que hacer y saber en qué orden hacerlo son dos cosas distintas. Partir el TP en etapas convierte una tarea en una lista.", l: ["Dividir la entrega", "herramientas", "dividir"] },
    { q: "Me siento a estudiar y a los diez minutos estoy en otra cosa.", t: "Regulación de la atención", x: "Bloques cortos con un objetivo único y pausas planificadas funcionan mejor que sesiones largas a pura fuerza de voluntad.", l: ["Probar bloques de estudio", "herramientas", "bloques"] }
  ];
  let car = 0;
  const dotsEl = $("#car-dots");
  situations.forEach((s, i) => {
    const d = document.createElement("button");
    d.className = "dot"; d.type = "button"; d.setAttribute("aria-label", "Situación " + (i + 1));
    d.onclick = () => { if (i === car) return; const dir = i > car ? 1 : -1; car = i; renderCar(dir); };
    dotsEl.appendChild(d);
  });
  function renderCar(dir) {
    const s = situations[car];
    $("#car-quote").textContent = s.q;
    $("#car-title").textContent = "Qué puede haber detrás: " + s.t.toLowerCase();
    $("#car-text").textContent = s.x;
    const a = $("#car-link");
    a.textContent = s.l[0] + " →";
    a.dataset.go = s.l[1];
    if (s.l[2]) a.dataset.sub = s.l[2]; else delete a.dataset.sub;
    $$(".dot", dotsEl).forEach((d, i) => d.setAttribute("aria-current", i === car));
    $$(".car-slide").forEach((el) => {
      el.classList.remove("entering", "from-prev");
      if (!dir || isCalm()) return;
      void el.offsetWidth;
      el.classList.add("entering");
      if (dir < 0) el.classList.add("from-prev");
    });
  }
  // "¿Te pasa? ↓" baja hasta el carrusel (de una con "Sin animaciones").
  // Las pantallas del Inicio descuentan la cabecera fija, que cambia de alto con el tamaño de letra.
  const topEl = $(".top");
  const setTopH = () => root.style.setProperty("--top-h", topEl.offsetHeight + "px");
  setTopH();
  if ("ResizeObserver" in window) new ResizeObserver(setTopH).observe(topEl); else window.addEventListener("resize", setTopH);
  // "¿Te pasa? ↓" y "Tres formas ↓" bajan a la parte siguiente del Inicio (de una con "Sin animaciones").
  $$("[data-cue]").forEach((b) => { b.onclick = () => document.getElementById(b.dataset.cue).scrollIntoView({ behavior: isCalm() ? "auto" : "smooth", block: "start" }); });
  $("#car-prev").onclick = () => { car = (car - 1 + situations.length) % situations.length; renderCar(-1); };
  $("#car-next").onclick = () => { car = (car + 1) % situations.length; renderCar(1); };
  renderCar();

  /* ---------- Códigos visuales ---------- */
  const TYPES = {
    entrega: "Entrega", evaluacion: "Evaluación", correccion: "Corrección",
    teorica: "Clase teórica", taller: "Taller", aviso: "Aviso o cambio de aula"
  };
  const codeHtml = (k) => `<span class="code k-${k}"><span class="shape" aria-hidden="true"></span>${TYPES[k]}</span>`;
  const legend = Object.keys(TYPES).map(codeHtml).join("");
  $("#codes-legend").innerHTML = legend;
  $("#wk-legend").innerHTML = legend;
  $("#wk-type").innerHTML = Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");

  /* ---------- Traductor de consignas ---------- */
  const trIds = ["que", "comunicar", "cuenta", "entregar", "fecha", "paso"];
  const trLabels = { que: "Qué hacer", comunicar: "Qué comunicar", cuenta: "Qué tener en cuenta", entregar: "Qué entregar", fecha: "Fecha", paso: "Primer paso" };
  const TR_VERBS = { diseñ: "diseñar", rediseñ: "rediseñar", realiz: "realizar", elabor: "elaborar", cre: "crear", desarroll: "desarrollar", produc: "producir", produzc: "producir", propon: "proponer", propong: "proponer", analiz: "analizar", investig: "investigar", present: "presentar", ilustr: "ilustrar", maquet: "maquetar", redact: "redactar", constru: "construir", construy: "construir", arm: "armar", gener: "generar", confeccion: "confeccionar", plante: "plantear", resolv: "resolver", resuelv: "resolver", explor: "explorar", relev: "relevar", fotografi: "fotografiar", dibuj: "dibujar", intervin: "intervenir", interven: "intervenir", proyect: "proyectar", escrib: "escribir", compar: "comparar", seleccion: "seleccionar", investigu: "investigar", realic: "realizar", analic: "analizar", organiz: "organizar", organic: "organizar", document: "documentar", grab: "grabar", edit: "editar", entrevist: "entrevistar", bocet: "bocetar" };
  // Infinitivo (diseñar), subjuntivo (diseñe, diseñen), "deberán diseñar" o voseo (diseñá); la palabra entera, aunque lleve tildes o ñ
  const TR_VERB = new RegExp("(?<![\\p{L}])(" + Object.keys(TR_VERBS).sort((a, b) => b.length - a.length).join("|") + ")(?:ar|er|ir|en|an|e|á|é|í)(?![\\p{L}])", "giu");
  function translate(text) {
    const t = text.replace(/\s+/g, " ").trim();
    const out = {};
    // Qué hacer: cada verbo de tarea en infinitivo + su objeto, en el orden en que aparecen
    const plain = t.replace(/\s*\([^)]*\)/g, "");
    const acts = [];
    for (const m of plain.matchAll(TR_VERB)) {
      if (/\b(el|la|lo|los|las|del|al|se)\s*$/i.test(plain.slice(0, m.index))) continue; // "el presente trabajo", "se propone"
      const inf = TR_VERBS[m[1].toLowerCase()];
      const obj = plain.slice(m.index + m[0].length).split(/\s+y\s+que\s+|\s+que\s+|[,.;:]|\s+teniendo\s/i)[0].trim();
      const act = (inf.charAt(0).toUpperCase() + inf.slice(1) + " " + obj).trim();
      if (!acts.some((x) => x.startsWith(inf.charAt(0).toUpperCase() + inf.slice(1)))) acts.push(act);
    }
    out.que = acts.slice(0, 4).join(" · ");
    const c = t.match(/comuni(?:que|car|quen)\s+(.+?)(?:,|\.|\s+teniendo|\s+para\s)/i);
    out.comunicar = c ? c[1].replace(/^(el|la|los|las)\s+/i, "").trim() : "";
    const k = t.match(/(?:teniendo en cuenta|considerando|tener en cuenta|tengan en cuenta|tené en cuenta)\s+(.+?)\./i);
    out.cuenta = k ? k[1].split(/,\s*|\s+y\s+/).map((s) => s.trim()).filter(Boolean).join(" · ") : "";
    const fm = t.match(/\b(PDF|JPG|PNG|editable|impres[oa]|maqueta|archivo abierto|AI|PSD|InDesign)\b/gi);
    out.entregar = fm ? Array.from(new Set(fm.map((s) => /^(pdf|jpg|png|ai|psd)$/i.test(s) ? s.toUpperCase() : (s.toLowerCase() === "editable" ? "archivo editable" : s.toLowerCase())))).join(" + ") : "";
    const d = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    out.fecha = d ? pad(d[1]) + "/" + pad(d[2]) : "";
    out.paso = out.comunicar ? "Definir el concepto en una frase" : "Releer la consigna y marcar lo que no entiendo";
    const ev = t.match(/(?:se evalua(?:rá)?|se evaluará|se evalúa|criterios?:?)\s+(.+?)(?:\.|$)/i);
    out.evalua = ev ? ev[1].replace(/^(el|la|los|las)\s+/i, "").split(/,\s*|\s+y\s+/).map((s) => s.replace(/^(el|la|los|las)\s+/i, "").trim()).filter(Boolean) : [];
    return out;
  }
  let trEval = [];
  function renderTr() {
    const v = {}; trIds.forEach((id) => v[id] = $("#tr-" + id).value.trim());
    const cell = (id, cls) => `<div class="tp-cell ${cls || ""}"><span class="lbl">${trLabels[id]}</span><span>${esc(v[id] || "—")}</span></div>`;
    $("#tr-card").innerHTML = `
      <span class="tp-title">${v.que.includes(" · ") ? v.que.split(" · ").map((a, i) => (i + 1) + ". " + esc(a)).join("<br>") : esc(v.que || "Consigna")}</span>
      <div class="tp-grid">${cell("comunicar")}${cell("cuenta")}${cell("entregar")}${cell("fecha", "date")}</div>
      ${trEval.length ? `<div class="tp-cell"><span class="lbl">Se evalúa</span><ul class="scribble-list">${trEval.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}
      ${cell("paso", "key")}`;
    store.set("tr", { input: $("#tr-input").value, v, ev: trEval });
  }
  function runTr() {
    const r = translate($("#tr-input").value);
    trIds.forEach((id) => $("#tr-" + id).value = r[id] || "");
    trEval = r.evalua;
    const missing = trIds.filter((id) => !r[id]).map((id) => trLabels[id].toLowerCase());
    $("#tr-msg").textContent = missing.length ? "Completá a mano: " + missing.join(", ") + "." : "Revisá que cada campo esté bien.";
    renderTr();
  }
  $("#tr-run").onclick = runTr;
  trIds.forEach((id) => $("#tr-" + id).addEventListener("input", renderTr));
  const trSaved = store.get("tr", null);
  if (trSaved) { $("#tr-input").value = trSaved.input; trIds.forEach((id) => $("#tr-" + id).value = trSaved.v[id] || ""); trEval = trSaved.ev || []; renderTr(); }
  else runTr();
  $("#tr-input").addEventListener("input", () => store.set("tr", Object.assign(store.get("tr", {}), { input: $("#tr-input").value })));
  $("#tr-copy").onclick = () => {
    const lines = trIds.map((id) => trLabels[id].toUpperCase() + ": " + ($("#tr-" + id).value || "—"));
    if (trEval.length) lines.push("SE EVALÚA: " + trEval.join(", "));
    copyText(lines.join("\n"), $("#tr-msg"));
  };
  $("#tr-toplan").onclick = () => {
    dv.title = $("#tr-que").value.split(" · ")[0] || dv.title;
    const f = $("#tr-fecha").value.match(/(\d{1,2})\/(\d{1,2})/);
    if (f) {
      let d = new Date(today().getFullYear(), Number(f[2]) - 1, Number(f[1]));
      if (d < today()) d = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
      dv.due = iso(d);
    }
    if ($("#tr-paso").value) dv.stages[0].text = $("#tr-paso").value;
    saveDv(); renderDv();
    goTab("herramientas", true); goSub("dividir");
  };

  /* ---------- Mapa de la cursada ---------- */
  const mapSteps = [
    ["Inicio", "Leer la consigna completa una vez, sin hacer nada más.", "Abrí el traductor de consignas."],
    ["¿Qué tengo que hacer?", "Decirlo en una frase con tus palabras. Si no podés, preguntá antes de seguir.", "Una pregunta a tiempo ahorra un TP rehecho."],
    ["¿Qué necesito?", "Materiales, programas, referencias, apuntes. Hacé la lista ahora, no el día antes.", "Si falta algo, conseguilo primero."],
    ["¿Cómo lo organizo?", "Partir en etapas y ponerle una fecha a cada una.", "Usá Dividir la entrega."],
    ["Primer avance", "Algo imperfecto pero real: un boceto, una lista, un esquema.", "El objetivo es tener algo que mostrar, no que esté bien."],
    ["Corrección", "Llevar el avance a clase y anotar lo que te dicen en el momento.", "Pedí que te repitan si perdiste el hilo. Es válido."],
    ["Revisión", "Aplicar las correcciones de a una y tacharlas.", "Convertí cada corrección en un ítem de la lista."],
    ["Entrega", "Revisar formato, nombre de archivo y fecha. Entregar.", "Después, descansá. También es parte del proceso."]
  ];
  let mapCur = store.get("map", 3);
  function renderMap() {
    $("#map").innerHTML = mapSteps.map((s, i) => `
      <button class="map-step ${i < mapCur ? "passed" : ""} ${i === mapCur ? "current" : ""}" type="button" role="listitem" data-i="${i}" aria-current="${i === mapCur ? "step" : "false"}">
        <span class="node">${i < mapCur ? "✓" : i + 1}</span><span>${esc(s[0])}</span>
      </button>`).join("");
    const s = mapSteps[mapCur];
    $("#map-detail").innerHTML = `<span class="eyebrow">Estás en: ${esc(s[0])}</span><p>${esc(s[1])}</p><p class="small muted">${esc(s[2])}</p>`;
    $$("#map .map-step").forEach((b) => b.onclick = () => { mapCur = Number(b.dataset.i); store.set("map", mapCur); renderMap(); });
  }
  renderMap();

  /* ---------- Primer paso ---------- */
  const wzQs = [
    ["¿Qué tengo que hacer?", "Escribilo como te salga. Ejemplo: el TP de editorial.", "Pieza editorial para Diseño 2"],
    ["¿Por dónde empiezo?", "Elegí la parte más chica o la que menos te cuesta.", "Releer la consigna"],
    ["¿Qué necesito?", "Lo que tiene que estar a mano para arrancar.", "Consigna impresa y un lápiz"],
    ["¿Cuál es el primer paso?", "Algo que puedas hacer en menos de 10 minutos. Empezá con un verbo.", "Subrayar en la consigna qué hay que entregar"]
  ];
  let wz = store.get("wz", { i: 3, a: wzQs.map((q) => q[2]), sample: true });
  function renderWz() {
    $$("#wz-bar i").forEach((el, j) => el.classList.toggle("on", j <= wz.i));
    $("#wz-count").textContent = "Pregunta " + (wz.i + 1) + " de 4";
    $("#wz-q").textContent = wzQs[wz.i][0];
    $("#wz-help").textContent = wzQs[wz.i][1];
    $("#wz-input").value = wz.a[wz.i] || "";
    $("#wz-back").disabled = wz.i === 0;
    $("#wz-next").textContent = wz.i === 3 ? "Listo" : "Siguiente";
    $("#wz-result").textContent = wz.a[3] || "Respondé las cuatro preguntas";
    $("#wz-recap").innerHTML = wzQs.slice(0, 3).map((q, j) => `<dt>${esc(q[0].replace(/[¿?]/g, ""))}</dt><dd>${esc(wz.a[j] || "—")}</dd>`).join("")
      + (wz.sample ? `<dt></dt><dd><span class="example-tag">Ejemplo</span> Reemplazalo con lo tuyo.</dd>` : "");
    store.set("wz", wz);
  }
  $("#wz-input").addEventListener("input", (e) => { wz.a[wz.i] = e.target.value; wz.sample = false; renderWz(); });
  $("#wz-next").onclick = () => { if (wz.i < 3) { wz.i++; renderWz(); $("#wz-input").focus(); } else { $("#wz-result").focus?.(); } };
  $("#wz-back").onclick = () => { if (wz.i > 0) { wz.i--; renderWz(); $("#wz-input").focus(); } };
  $("#wz-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#wz-next").click(); } });
  renderWz();

  /* ---------- Dividir la entrega ---------- */
  const BASE = ["Entender la consigna", "Buscar información", "Seleccionar referencias", "Definir concepto", "Hacer bocetos", "Diseñar", "Revisar", "Entregar"];
  const mkStages = () => BASE.map((t) => ({ text: t, done: false, date: "" }));
  let dv = store.get("dv", null);
  if (!dv) {
    dv = { title: "TP 03 · Pieza editorial", due: iso(addDays(today(), 12)), stages: mkStages() };
    dv.stages[0].done = true; dv.stages[1].done = true;
  }
  const saveDv = () => store.set("dv", dv);
  function renderDv() {
    $("#dv-title").value = dv.title;
    $("#dv-due").value = dv.due;
    const done = dv.stages.filter((s) => s.done).length;
    const nextI = dv.stages.findIndex((s) => !s.done);
    $("#dv-bar").style.width = (dv.stages.length ? (done / dv.stages.length) * 100 : 0) + "%";
    $("#dv-status").innerHTML = `<b>${done} de ${dv.stages.length} etapas</b>` + (nextI >= 0 ? ` · Sigue: ${esc(dv.stages[nextI].text)}` : " · ¡Todo listo!");
    if (dv.due) {
      const n = daysBetween(today(), fromIso(dv.due));
      $("#dv-days").textContent = n > 1 ? `Faltan ${n} días` : n === 1 ? "Es mañana" : n === 0 ? "Es hoy" : `Venció hace ${-n} días`;
    } else $("#dv-days").textContent = "";
    $("#dv-list").innerHTML = dv.stages.map((s, i) => `
      <li class="stage ${s.done ? "done" : ""} ${i === nextI ? "next" : ""}">
        <span class="n">${pad(i + 1)}</span>
        <input type="checkbox" id="dv-c-${i}" data-i="${i}" ${s.done ? "checked" : ""} aria-label="Marcar ${esc(s.text)} como hecha">
        <input type="text" id="dv-t-${i}" data-i="${i}" value="${esc(s.text)}" aria-label="Nombre de la etapa ${i + 1}">
        <input type="date" id="dv-d-${i}" data-i="${i}" value="${esc(s.date)}" aria-label="Fecha de la etapa ${i + 1}">
        <button class="icon-btn" type="button" data-del="${i}" aria-label="Quitar etapa ${i + 1}">×</button>
      </li>`).join("");
  }
  $("#dv-list").addEventListener("change", (e) => {
    const i = Number(e.target.dataset.i);
    if (e.target.type === "checkbox") { dv.stages[i].done = e.target.checked; saveDv(); renderDv(); }
    if (e.target.type === "date") { dv.stages[i].date = e.target.value; saveDv(); }
  });
  $("#dv-list").addEventListener("input", (e) => {
    if (e.target.type === "text") { dv.stages[Number(e.target.dataset.i)].text = e.target.value; saveDv(); }
  });
  $("#dv-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]");
    if (b) { dv.stages.splice(Number(b.dataset.del), 1); saveDv(); renderDv(); }
  });
  $("#dv-title").addEventListener("input", (e) => { dv.title = e.target.value; saveDv(); });
  $("#dv-due").addEventListener("change", (e) => { dv.due = e.target.value; saveDv(); renderDv(); });
  $("#dv-add").onclick = () => { dv.stages.push({ text: "Nueva etapa", done: false, date: "" }); saveDv(); renderDv(); $("#dv-t-" + (dv.stages.length - 1)).select(); };
  $("#dv-reset").onclick = () => { dv.stages = mkStages(); saveDv(); renderDv(); };
  $("#dv-spread").onclick = () => {
    if (!dv.due) { $("#dv-days").textContent = "Primero poné la fecha de entrega."; return; }
    const pending = dv.stages.filter((s) => !s.done);
    const span = daysBetween(today(), fromIso(dv.due));
    if (span < 0 || !pending.length) return;
    pending.forEach((s, j) => { s.date = iso(addDays(today(), Math.round(((j + 1) * span) / pending.length))); });
    saveDv(); renderDv();
  };
  renderDv();

  /* ---------- Mi semana ---------- */
  const monday = (d) => { const x = new Date(d); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); x.setHours(0, 0, 0, 0); return x; };
  let wk = store.get("wk", null);
  if (!wk) {
    const m = monday(today());
    wk = { sample: true, items: [
      { id: 1, title: "Teórico Historia del Diseño", type: "teorica", date: iso(m), time: "09:00" },
      { id: 2, title: "Taller Tipografía", type: "taller", date: iso(addDays(m, 1)), time: "14:00" },
      { id: 3, title: "Corrección de bocetos TP 03", type: "correccion", date: iso(addDays(m, 3)), time: "14:00" },
      { id: 4, title: "Cambio de aula: Morfología pasa al 204", type: "aviso", date: iso(addDays(m, 2)), time: "" },
      { id: 5, title: "Parcial Comunicación", type: "evaluacion", date: iso(addDays(m, 9)), time: "18:00" },
      { id: 6, title: "Entrega TP 03 Pieza editorial", type: "entrega", date: iso(addDays(today(), 12)), time: "23:59" }
    ] };
  }
  let wkStart = monday(today());
  const saveWk = () => store.set("wk", wk);
  function renderWk() {
    const end = addDays(wkStart, 6);
    $("#wk-label").textContent = `Semana del ${wkStart.getDate()} de ${MONTHS[wkStart.getMonth()]} al ${end.getDate()} de ${MONTHS[end.getMonth()]}`;
    const t = iso(today());
    let html = "";
    for (let i = 0; i < 7; i++) {
      const d = addDays(wkStart, i), di = iso(d);
      const items = wk.items.filter((x) => x.date === di).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
      html += `<div class="day ${di === t ? "today" : ""} ${items.length ? "has" : ""}"><h4><span>${DAYS[i]} ${d.getDate()}</span>${di === t ? "<span>Hoy</span>" : ""}</h4>`
        + (items.length ? items.map((x) => `<div class="ev k-${x.type}"><span class="meta"><span class="shape" aria-hidden="true"></span>${TYPES[x.type].split(" ")[0]}${x.time ? " · " + esc(x.time) : ""}</span><b>${esc(x.title)}</b><button class="icon-btn del" type="button" data-del="${x.id}" aria-label="Quitar ${esc(x.title)}">×</button></div>`).join("") : `<span class="small muted empty">Libre</span>`)
        + `</div>`;
    }
    $("#wk-grid").innerHTML = html;
    $("#wk-sample-note").innerHTML = wk.sample ? `<span class="example-tag">Ejemplo</span> Estos eventos son de muestra. <button class="icon-btn small" type="button" id="wk-clear" style="font-size:inherit;color:var(--accent)">Borrar ejemplos</button>` : "";
    const clr = $("#wk-clear"); if (clr) clr.onclick = () => { wk = { sample: false, items: [] }; saveWk(); renderWk(); };
    const next = wk.items.filter((x) => (x.type === "entrega" || x.type === "evaluacion") && x.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (next) {
      const n = daysBetween(today(), fromIso(next.date));
      $("#wk-next").innerHTML = `<span class="days">${n}</span><div><b>${n === 1 ? "día" : "días"} para</b><br>${esc(next.title)}<br>${codeHtml(next.type)}</div>`;
    } else $("#wk-next").innerHTML = `<p class="muted">No tenés entregas ni evaluaciones cargadas. Agregá la próxima para ver cuántos días faltan.</p>`;
  }
  $("#wk-grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]");
    if (b) { wk.items = wk.items.filter((x) => x.id !== Number(b.dataset.del)); saveWk(); renderWk(); }
  });
  $("#wk-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = $("#wk-title").value.trim(), date = $("#wk-date").value;
    if (!title || !date) return;
    if (wk.sample) wk = { sample: false, items: [] };
    wk.items.push({ id: Date.now(), title, type: $("#wk-type").value, date, time: $("#wk-time").value });
    saveWk();
    wkStart = monday(fromIso(date));
    $("#wk-title").value = ""; $("#wk-time").value = "";
    renderWk();
  });
  $("#wk-date").value = iso(today());
  $("#wk-prev").onclick = () => { wkStart = addDays(wkStart, -7); renderWk(); };
  $("#wk-nextw").onclick = () => { wkStart = addDays(wkStart, 7); renderWk(); };
  $("#wk-today").onclick = () => { wkStart = monday(today()); renderWk(); };
  renderWk();

  /* ---------- Bloques de estudio ---------- */
  const C = 2 * Math.PI * 52;
  const ring = $("#tm-ring");
  ring.style.strokeDasharray = C;
  let tm = { focus: 10, phase: "focus", left: 600, total: 600, running: false, done: store.get("blocks", 0) };
  let tick = null;
  $("#tm-presets").innerHTML = [10, 15, 25].map((m) => `<button class="chip-btn" type="button" data-m="${m}" aria-pressed="false">${m} min</button>`).join("");
  function setPreset(m) { stopTm(); tm.focus = m; tm.phase = "focus"; tm.total = tm.left = m * 60; renderTm(); }
  $$("#tm-presets button").forEach((b) => b.onclick = () => setPreset(Number(b.dataset.m)));
  function renderTm() {
    $("#tm-time").textContent = pad(Math.floor(tm.left / 60)) + ":" + pad(tm.left % 60);
    $("#tm-phase").textContent = tm.phase === "focus" ? "Bloque de foco" : "Pausa: levantate, tomá agua";
    ring.style.strokeDashoffset = C * (1 - tm.left / tm.total);
    ring.classList.toggle("pause", tm.phase !== "focus");
    $("#tm-start").textContent = tm.running ? "Pausar" : (tm.left < tm.total ? "Seguir" : "Empezar");
    $$("#tm-presets button").forEach((b) => b.setAttribute("aria-pressed", Number(b.dataset.m) === tm.focus));
    $("#tm-done-label").textContent = tm.done ? `Bloques completados hoy: ${tm.done}` : "Todavía no completaste bloques hoy.";
    $("#tm-blocks").innerHTML = "<i></i>".repeat(Math.min(tm.done, 24));
  }
  function stopTm() { clearInterval(tick); tick = null; tm.running = false; }
  $("#tm-start").onclick = () => {
    if (tm.running) { stopTm(); renderTm(); return; }
    tm.running = true;
    tick = setInterval(() => {
      tm.left--;
      if (tm.left <= 0) {
        if (tm.phase === "focus") { tm.done++; store.set("blocks", tm.done); tm.phase = "break"; tm.total = tm.left = 5 * 60; }
        else { tm.phase = "focus"; tm.total = tm.left = tm.focus * 60; stopTm(); }
      }
      renderTm();
    }, 1000);
    renderTm();
  };
  $("#tm-reset").onclick = () => setPreset(tm.focus);
  renderTm();

  /* ---------- Docentes: plantilla ---------- */
  const dcIds = ["name", "que", "para", "como", "con", "cuando", "formato", "eval"];
  function renderDc() {
    const v = {}; dcIds.forEach((id) => v[id] = $("#dc-" + id).value.trim());
    const etapas = v.como.split("\n").map((s) => s.trim()).filter(Boolean);
    const ev = v.eval.split(",").map((s) => s.trim()).filter(Boolean);
    $("#dc-card").innerHTML = `
      <span class="tp-title">${esc(v.name || "Trabajo práctico")}</span>
      <div class="tp-grid">
        <div class="tp-cell key"><span class="lbl">Qué</span><span>${esc(v.que || "—")}</span></div>
        <div class="tp-cell"><span class="lbl">Para qué</span><span>${esc(v.para || "—")}</span></div>
      </div>
      <div class="tp-grid">
        <div class="tp-cell date"><span class="lbl">Entrega</span><span><b>${esc(v.cuando || "—")}</b></span></div>
        <div class="tp-cell"><span class="lbl">Formato</span><span>${esc(v.formato || "—")}</span></div>
        <div class="tp-cell"><span class="lbl">Con qué</span><span>${esc(v.con || "—")}</span></div>
      </div>
      <div class="tp-grid">
        <div class="tp-cell"><span class="lbl">Etapas</span><ol>${etapas.map((e) => `<li>${esc(e)}</li>`).join("")}</ol></div>
        <div class="tp-cell"><span class="lbl">Se evalúa</span><ul style="list-style:'✓  '">${ev.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>
      </div>`;
    store.set("dc", v);
  }
  const dcSaved = store.get("dc", null);
  if (dcSaved) dcIds.forEach((id) => { if (dcSaved[id] != null) $("#dc-" + id).value = dcSaved[id]; });
  dcIds.forEach((id) => $("#dc-" + id).addEventListener("input", renderDc));
  renderDc();
  $("#dc-copy").onclick = () => {
    const g = (id) => $("#dc-" + id).value.trim();
    const txt = [g("name").toUpperCase(), "", "QUÉ: " + g("que"), "PARA QUÉ: " + g("para"), "ENTREGA: " + g("cuando"), "FORMATO: " + g("formato"), "CON QUÉ: " + g("con"), "ETAPAS:"]
      .concat(g("como").split("\n").filter(Boolean).map((s, i) => pad(i + 1) + ". " + s.trim()))
      .concat(["SE EVALÚA:"], g("eval").split(",").filter(Boolean).map((s) => "✓ " + s.trim())).join("\n");
    copyText(txt, $("#dc-msg"));
  };

  /* ---------- Apoyo: áreas pedagógicas ----------
     BORRADOR: completar con los datos reales de la facultad.
     Los campos vacíos se muestran como "A completar". */
  const AREAS = [
    { id: "psicopedagogia", nombre: "Gabinete psicopedagógico", que: "Acompaña dificultades de aprendizaje, organización del estudio y estrategias para cursar y rendir.", cuando: "Si te cuesta sostener la cursada, empezar tareas o preparar exámenes.", tel: "", mail: "", horario: "", lugar: "" },
    { id: "orientacion", nombre: "Orientación pedagógica / tutorías", que: "Tutores que ayudan a planificar la cursada, elegir cuántas materias hacer y armar un plan de estudio.", cuando: "Al inscribirte a materias o si te atrasaste con la carrera.", tel: "", mail: "", horario: "", lugar: "" },
    { id: "accesibilidad", nombre: "Área de accesibilidad e inclusión", que: "Gestiona adecuaciones razonables: más tiempo en exámenes, consignas por escrito, otros formatos de evaluación.", cuando: "Si necesitás ajustes en la cursada o en las evaluaciones.", tel: "", mail: "", horario: "", lugar: "" },
    { id: "bienestar", nombre: "Bienestar estudiantil", que: "Orientación en salud, salud mental, becas y situaciones personales que afectan la cursada.", cuando: "Si te sentís desbordada o desbordado, o necesitás una consulta con profesionales.", tel: "", mail: "", horario: "", lugar: "" },
    { id: "academica", nombre: "Secretaría académica / de alumnos", que: "Trámites, regularidad, fechas de examen, cambios de comisión y reclamos sobre la cursada.", cuando: "Para consultas administrativas o si un problema con una materia no se resuelve con la cátedra.", tel: "", mail: "", horario: "", lugar: "" }
  ];
  const todo = '<span class="todo">A completar</span>';
  const contactRow = (label, v, href) => `<dt>${label}</dt><dd>${v ? (href ? `<a href="${esc(href)}">${esc(v)}</a>` : esc(v)) : todo}</dd>`;
  $("#areas").innerHTML = AREAS.map((a) => `
    <article class="area">
      <h3>${esc(a.nombre)}</h3>
      <p class="small">${esc(a.que)}</p>
      <p class="when"><b>Cuándo ir:</b> ${esc(a.cuando)}</p>
      <dl class="contact-list">
        ${contactRow("Teléfono", a.tel, a.tel ? "tel:" + a.tel.replace(/[^\d+]/g, "") : "")}
        ${contactRow("Mail", a.mail, a.mail ? "mailto:" + a.mail : "")}
        ${contactRow("Horario", a.horario)}
        ${contactRow("Dónde", a.lugar)}
      </dl>
      <div class="row"><a class="btn ghost" href="#contacto" data-scroll="contacto" data-area="${esc(a.id)}">Escribir a esta área</a></div>
    </article>`).join("");

  /* ---------- Contacto (pie): arma el mensaje, no envía nada ---------- */
  const ct = store.get("contacto", {});
  $("#ct-area").innerHTML = AREAS.map((a) => `<option value="${esc(a.id)}">${esc(a.nombre)}</option>`).join("");
  const ctFields = ["area", "name", "carrera", "email", "msg"];
  ctFields.forEach((k) => { if (ct[k]) $("#ct-" + k).value = ct[k]; });
  $$("#ct-motivos input").forEach((c) => { c.checked = (ct.motivos || []).includes(c.value); });
  $$('input[name="ct-modo"]').forEach((r) => { if (ct.modo) r.checked = r.value === ct.modo; });
  function ctRead() {
    const d = {};
    ctFields.forEach((k) => { d[k] = $("#ct-" + k).value.trim(); });
    d.motivos = $$("#ct-motivos input:checked").map((c) => c.value);
    d.modo = ($('input[name="ct-modo"]:checked') || {}).value || "";
    return d;
  }
  function ctCompose(d) {
    const area = AREAS.find((a) => a.id === d.area) || AREAS[0];
    const lines = ["Hola, equipo de " + area.nombre + ":", ""];
    lines.push("Mi nombre es " + (d.name || "[tu nombre]") + (d.carrera ? ", curso " + d.carrera : "") + ".");
    if (d.motivos.length) lines.push("Quería consultarles sobre: " + d.motivos.join("; ").toLowerCase() + ".");
    if (d.msg) lines.push("", d.msg);
    lines.push("", "Para el primer contacto prefiero: " + d.modo.toLowerCase() + ".");
    if (d.email) lines.push("Me pueden responder a " + d.email + ".");
    lines.push("", "Gracias.", d.name || "");
    return { area, subject: "Consulta de estudiante" + (d.motivos.length ? ": " + d.motivos[0].toLowerCase() : ""), body: lines.join("\n").trim() };
  }
  function ctRender() {
    const d = ctRead();
    store.set("contacto", d);
    const m = ctCompose(d);
    $("#ct-preview").textContent = "Asunto: " + m.subject + "\n\n" + m.body;
    $("#ct-mail").href = "mailto:" + encodeURIComponent(m.area.mail || "") + "?subject=" + encodeURIComponent(m.subject) + "&body=" + encodeURIComponent(m.body);
    $("#ct-status").textContent = m.area.mail ? "" : "Todavía no está cargado el mail de esta área: vas a tener que escribir la dirección en tu correo.";
  }
  $("#ct-form").addEventListener("input", ctRender);
  $("#ct-form").addEventListener("change", ctRender);
  $("#ct-form").addEventListener("submit", (e) => e.preventDefault());
  $("#ct-copy").onclick = () => copyText($("#ct-preview").textContent, $("#ct-status"));
  $("#ct-clear").onclick = () => {
    $("#ct-form").reset();
    store.set("contacto", {});
    ctRender();
    $("#ct-status").textContent = "Borrador borrado.";
  };
  ctRender();
  // Botones que llevan al formulario (y eligen el área si corresponde): abren la pestaña Contacto.
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-scroll]");
    if (!b) return;
    e.preventDefault();
    if (b.dataset.area) { $("#ct-area").value = b.dataset.area; ctRender(); }
    goTab(b.dataset.scroll, false);
    $("#ct-area").focus({ preventScroll: true });
  });

  /* ---------- Tres conceptos ----------
     Al tocar un concepto, crece y se desliza hasta el centro mientras los otros dos se desvanecen en su lugar
     (todo a la vez, sin pausa). Después el texto se arma palabra por palabra. Tocándolo de nuevo vuelve todo.
     El movimiento se hace midiendo el recuadro antes y después del cambio y animando la diferencia. */
  const concepts = $("#concepts");
  if (concepts) {
    const items = $$(".concept", concepts);
    const EASE = "cubic-bezier(0.4, 0, 0.2, 1)", DUR = 550;
    // Cada palabra del texto va en su propio <span class="w">, con un punto de partida al azar para "ensamblarse".
    // Lo que está resaltado (como el TDAH en el óvalo) entra entero, como una sola pieza.
    const splitWords = (el) => {
      let n = 0;
      const mark = (w) => {
        w.classList.add("w");
        w.style.setProperty("--i", n++);
        w.style.setProperty("--dx", `${(Math.random() - 0.5) * 40}px`);
        w.style.setProperty("--dy", `${(Math.random() - 0.5) * 28}px`);
        w.style.setProperty("--rot", `${(Math.random() - 0.5) * 24}deg`);
      };
      const walk = (node) => {
        [...node.childNodes].forEach((ch) => {
          if (ch.nodeType === 3) {
            const frag = document.createDocumentFragment();
            ch.textContent.split(/(\s+)/).forEach((part) => {
              if (!part) return;
              if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
              const s = document.createElement("span"); s.textContent = part; mark(s); frag.appendChild(s);
            });
            ch.replaceWith(frag);
          } else if (ch.nodeType === 1) {
            if (ch.classList.contains("circled")) mark(ch); else walk(ch);
          }
        });
      };
      walk(el);
    };
    items.forEach((item) => splitWords($(".concept-body", item)));

    // Lleva el recuadro desde donde estaba (first) hasta su lugar nuevo, creciendo o achicándose de a poco.
    const morph = (el, first) => {
      const last = el.getBoundingClientRect();
      el.style.transition = "none";
      el.style.width = `${first.width}px`;
      el.style.transform = `translate(${first.left + first.width / 2 - last.left - last.width / 2}px, ${first.top - last.top}px)`;
      el.getBoundingClientRect();
      el.style.transition = `transform ${DUR}ms ${EASE}, width ${DUR}ms ${EASE}`;
      el.style.width = `${last.width}px`;
      el.style.transform = "";
      clearTimeout(el._morph);
      el._morph = setTimeout(() => { el.style.width = ""; el.style.transition = ""; }, DUR + 50);
    };
    const setOpen = (item, open) => {
      $(".concept-title", item).setAttribute("aria-expanded", open);
      $(".concept-body", item).hidden = !open;
    };
    let gone = 0;
    items.forEach((item) => {
      $(".concept-title", item).addEventListener("click", () => {
        const calm = isCalm();
        const others = items.filter((o) => o !== item);
        const first = item.getBoundingClientRect();
        clearTimeout(gone);
        if (!item.classList.contains("open")) {
          // Los otros dos quedan fijos donde estaban y se desvanecen ahí mismo, mientras el elegido crece.
          const box = concepts.getBoundingClientRect();
          others.forEach((o) => {
            const r = o.getBoundingClientRect();
            Object.assign(o.style, { position: "absolute", left: `${r.left - box.left}px`, top: `${r.top - box.top}px`, width: `${r.width}px` });
          });
          item.classList.add("open");
          concepts.classList.add("fading", "focused");
          setOpen(item, true);
          if (!calm) morph(item, first);
          gone = setTimeout(() => concepts.classList.add("gone"), calm ? 0 : DUR);
        } else {
          setOpen(item, false);
          item.classList.remove("open");
          concepts.classList.remove("focused", "gone");
          others.forEach((o) => Object.assign(o.style, { position: "", left: "", top: "", width: "" }));
          if (!calm) morph(item, first);
          // Los otros dos reaparecen en su lugar con el mismo fundido, mientras el elegido vuelve.
          requestAnimationFrame(() => requestAnimationFrame(() => concepts.classList.remove("fading")));
        }
      });
    });
  }

  /* ---------- Estado inicial ---------- */
  const hash = (location.hash || "").slice(1);
  goSub(store.get("sub", "primer"));
  goTab(sectionIds.includes(hash) ? hash : "inicio", false);
  // El navegador salta solo hasta el #ancla al cargar: la pestaña tiene que arrancar desde arriba.
  if (hash) window.addEventListener("load", () => window.scrollTo(0, 0));
})();
