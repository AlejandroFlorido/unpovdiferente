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
  // La última pantalla de cada pestaña (.screen.last) deja lugar para el "Siguiente" y el pie, que se ven dentro de ella.
  const lastScreens = $$(".screen.last");
  const setTailH = () => {
    const last = lastScreens.find((el) => el.offsetParent);
    if (!last) return;
    const tail = document.documentElement.scrollHeight - (last.getBoundingClientRect().bottom + window.scrollY);
    root.style.setProperty("--tail-h", Math.max(0, Math.round(tail)) + "px");
  };
  setTailH();
  if ("ResizeObserver" in window) { const ro = new ResizeObserver(setTailH); lastScreens.forEach((el) => ro.observe(el.parentElement)); ro.observe($("footer")); }
  window.addEventListener("resize", setTailH);
  // "¿Te pasa? ↓" y "Tres formas ↓" bajan a la parte siguiente del Inicio (de una con "Sin animaciones").
  // Los botones "↑" vuelven a la parte anterior; si es la primera pantalla de la pestaña, sube hasta arriba de todo.
  $$("[data-cue]").forEach((b) => { b.onclick = () => {
    const t = document.getElementById(b.dataset.cue), behavior = isCalm() ? "auto" : "smooth";
    if (t === t.parentElement.firstElementChild) window.scrollTo({ top: 0, behavior });
    else t.scrollIntoView({ behavior, block: "start" });
  }; });
  $("#car-prev").onclick = () => { car = (car - 1 + situations.length) % situations.length; renderCar(-1); };
  $("#car-next").onclick = () => { car = (car + 1) % situations.length; renderCar(1); };
  renderCar();

  /* ---------- Mitos ---------- */
  const myths = [
    ["Es falta de voluntad o de interés.", "Es una condición del neurodesarrollo. Afecta funciones como planificar, iniciar tareas y sostener la atención, aunque haya muchas ganas."],
    ["Solo les pasa a chicos y chicas.", "En muchas personas continúa en la adultez. En la universidad aumenta la autonomía que se pide y por eso a veces se nota más."],
    ["Si se concentra en lo que le gusta, no tiene TDAH.", "La atención se regula según el interés. El hiperfoco existe y convive con la dificultad para concentrarse en lo que no engancha."],
    ["Es estar moviéndose todo el tiempo.", "Hay presentaciones donde predomina la inatención, más silenciosas y fáciles de pasar por alto."],
    ["Hay que bajar la exigencia.", "Lo que ayuda es información clara, estructura y fechas visibles. La exigencia puede ser la misma."],
    ["Es algo que se supera con organización.", "Las herramientas ayudan mucho, pero no cambian la condición. Son apoyos, como los anteojos para la vista."]
  ];
  $("#myths").innerHTML = myths.map((m, i) => `
    <div class="myth">
      <button type="button" aria-expanded="false" aria-controls="myth-${i}">
        <span class="tag m">Mito</span><span class="claim">${esc(m[0])}</span><span class="hint">Ver la realidad</span>
      </button>
      <div class="reveal" id="myth-${i}" hidden><span class="tag r">Realidad</span><p class="small">${esc(m[1])}</p></div>
    </div>`).join("");
  $$("#myths .myth button").forEach((b) => b.onclick = () => {
    const open = b.getAttribute("aria-expanded") !== "true";
    b.setAttribute("aria-expanded", open);
    $(".hint", b).textContent = open ? "Ocultar" : "Ver la realidad";
    const r = document.getElementById(b.getAttribute("aria-controls"));
    if (r.anim) r.anim.cancel();
    r.hidden = false;
    if (isCalm()) { r.hidden = !open; return; }
    // Despliega o pliega la realidad de a poco: alto, relleno y opacidad juntos.
    const cs = getComputedStyle(r);
    const full = { height: r.offsetHeight + "px", paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, opacity: 1 };
    const zero = { height: "0px", paddingTop: "0px", paddingBottom: "0px", opacity: 0 };
    r.style.overflow = "hidden";
    r.anim = r.animate(open ? [zero, full] : [full, zero], { duration: 320, easing: "cubic-bezier(.4,0,.2,1)" });
    r.anim.onfinish = () => { r.style.overflow = ""; r.hidden = !open; r.anim = null; };
  });

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
  // Formas que no son infinitivo (subjuntivo, voseo, irregulares) → infinitivo
  const TR_VERBS = { diseñ: "diseñar", rediseñ: "rediseñar", realiz: "realizar", elabor: "elaborar", cre: "crear", desarroll: "desarrollar", produc: "producir", produzc: "producir", propon: "proponer", propong: "proponer", analiz: "analizar", investig: "investigar", present: "presentar", ilustr: "ilustrar", maquet: "maquetar", redact: "redactar", constru: "construir", construy: "construir", arm: "armar", gener: "generar", confeccion: "confeccionar", plante: "plantear", resolv: "resolver", resuelv: "resolver", explor: "explorar", relev: "relevar", fotografi: "fotografiar", dibuj: "dibujar", intervin: "intervenir", interven: "intervenir", proyect: "proyectar", escrib: "escribir", compar: "comparar", seleccion: "seleccionar", investigu: "investigar", realic: "realizar", analic: "analizar", organiz: "organizar", organic: "organizar", document: "documentar", grab: "grabar", edit: "editar", entrevist: "entrevistar", bocet: "bocetar", dej: "dejar", elimin: "eliminar", marc: "marcar", marqu: "marcar", recort: "recortar", reduzc: "reducir", reduc: "reducir", sintetic: "sintetizar", sintetiz: "sintetizar", busqu: "buscar", busc: "buscar", revis: "revisar", corrij: "corregir", correg: "corregir", reescrib: "reescribir", narr: "narrar", describ: "describir", identifiqu: "identificar", identific: "identificar", explic: "explicar", expliqu: "explicar", justifiqu: "justificar", justific: "justificar", resum: "resumir", complet: "completar", entreg: "entregar", entregu: "entregar", sub: "subir", expong: "exponer", expon: "exponer", observ: "observar", tom: "tomar", respond: "responder", contest: "contestar", ubiqu: "ubicar", ubic: "ubicar", relacion: "relacionar", vincul: "vincular", agreg: "agregar", agregu: "agregar", tach: "tachar", subray: "subrayar", list: "listar", mir: "mirar", escuch: "escuchar", consult: "consultar", imagin: "imaginar", defin: "definir", reflexion: "reflexionar", argument: "argumentar", fundament: "fundamentar", ordená: "ordenar", orden: "ordenar", cont: "contar", public: "publicar", publiqu: "publicar", coment: "comentar", particip: "participar", debat: "debatir", visualiz: "visualizar", visualic: "visualizar", respond: "responder", envi: "enviar", sub: "subir", cit: "citar", aport: "aportar" };
  const TR_IRREG = { lean: "leer", lea: "leer", "leé": "leer", piensen: "pensar", piense: "pensar", "pensá": "pensar", elijan: "elegir", elija: "elegir", "elegí": "elegir", hagan: "hacer", haga: "hacer", "hacé": "hacer", vean: "ver", vea: "ver", "mirá": "mirar", cuenten: "contar", cuente: "contar", "poné": "poner", pongan: "poner", "sacá": "sacar", saquen: "sacar", "tené": "tener", tengan: "tener", "decí": "decir", digan: "decir", "andá": "ir", vayan: "ir", "traé": "traer", traigan: "traer" };
  // Sustantivos y adjetivos que terminan como un infinitivo
  const TR_NOT_VERB = new Set("lugar hogar mujer poder deber placer taller collar mar par bar militar popular familiar particular similar regular escolar solar primer cualquier altar azar billar dólar éter cráter carácter alfiler mantel nivel".split(" "));
  const TR_READ = /^(leer|ver|mirar|escuchar|consultar|buscar)$/;
  const TR_SEQ = /^(?:primero|después|luego|más tarde|a continuación|finalmente|por último|al final|también|además|y|e)\b,?\s*/i;
  const TR_MODAL = /^(?:se\s+(?:debe|deberá|deben|deberán|pide|solicita)\s+|deber(?:á|án|ás)\s+|deben\s+|tienen\s+que\s+|tenés\s+que\s+|tendrán\s+que\s+|hay\s+que\s+|(?:les|te)\s+(?:pedimos|pido)\s+que\s+|se\s+propone\s+)/i;
  function trVerb(word) {
    const w = (word || "").toLowerCase();
    if (!w || TR_NOT_VERB.has(w)) return "";
    if (TR_IRREG[w]) return TR_IRREG[w];
    const m = w.match(/^(\p{L}+?)(?:ar|er|ir)(?:se|lo|la|los|las|le|les)?$/u);
    if (m && w.length > 3) return w.replace(/(?<=(?:ar|er|ir))(?:se|lo|la|los|las|le|les)$/u, "");
    for (const k of Object.keys(TR_VERBS).sort((a, b) => b.length - a.length)) {
      if (w.startsWith(k) && /^(?:en|an|e|a|á|é|í)$/u.test(w.slice(k.length))) return TR_VERBS[k];
    }
    return "";
  }
  const trFirst = (s) => (s.match(/^\p{L}+/u) || [""])[0];
  const trCap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const trList = (s) => s.split(/,\s*|\s+y\s+(?!\d)/).map((x) => x.replace(/^(?:el|la|los|las)\s+/i, "").trim()).filter(Boolean);
  // Partes de la consigna: el traductor sugiere y el estudiante corrige tocando cada parte
  const TR_CATS = {
    paso: { name: "Qué hacer", tag: "Hacer" },
    cuenta: { name: "Qué tener en cuenta", tag: "Tener en cuenta" },
    entregar: { name: "Qué entregar", tag: "Entrega" },
    fecha: { name: "Fecha", tag: "Fecha" },
    evalua: { name: "Cómo se evalúa", tag: "Se evalúa" },
    otro: { name: "Contexto (no es tarea)", tag: "Contexto" }
  };
  // Fechas: 20/10, 14 de noviembre, el jueves, antes del domingo, mañana, en 10 días, la próxima clase...
  const TR_WD = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const TR_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const trWdRe = "lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo", trMesRe = TR_MES.join("|") + "|setiembre";
  const TR_DATE = new RegExp("\\s*(?<![\\p{L}\\d])(?:(?:antes|después)\\s+del?\\s+|(?:hasta|para|a más tardar|como máximo|como mucho)\\s+(?:el\\s+|la\\s+)?|(?:el|la|este|esta)\\s+)?" +
    "(?:(?:próximo\\s+)?(?:" + trWdRe + ")(?:\\s+\\d{1,2}(?:\\s+de\\s+(?:" + trMesRe + "))?)?(?:\\s+que viene|\\s+próximo)?" +
    "|\\d{1,2}[\\/\\-]\\d{1,2}(?:[\\/\\-]\\d{2,4})?|\\d{1,2}\\s+de\\s+(?:" + trMesRe + ")(?:\\s+de\\s+\\d{4})?" +
    "|pasado mañana|(?<!la\\s)mañana|hoy|(?:la\\s+)?(?:próxima clase|clase que viene|semana que viene|próxima semana)|fin de mes|(?:en|dentro de)\\s+\\d+\\s+días)(?![\\p{L}\\d])", "iu");
  // Convierte lo que dice la consigna en una fecha real, contando desde hoy
  function trWhen(txt) {
    const t = trClean(txt).replace(/^(?:el\s+)?(?:plazo|fecha de entrega|fecha límite)?\s*(?:vence|es)?\s*/i, "");
    const low = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const now = today();
    let d = null, guess = false;
    const fix = (x) => (x < addDays(now, -30) ? new Date(x.getFullYear() + 1, x.getMonth(), x.getDate()) : x);
    let m;
    if ((m = low.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/))) d = m[3] ? new Date(Number(m[3].length === 2 ? "20" + m[3] : m[3]), m[2] - 1, m[1]) : fix(new Date(now.getFullYear(), m[2] - 1, m[1]));
    else if ((m = low.match(/(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?/)) && TR_MES.concat("setiembre").includes(m[2])) {
      const mi = m[2] === "setiembre" ? 8 : TR_MES.indexOf(m[2]);
      d = m[3] ? new Date(Number(m[3]), mi, m[1]) : fix(new Date(now.getFullYear(), mi, m[1]));
    } else if ((m = low.match(/(domingo|lunes|martes|miercoles|jueves|viernes|sabado)(?:\s+(\d{1,2}))?/))) {
      const wd = TR_WD.map((w) => w.normalize("NFD").replace(/[̀-ͯ]/g, "")).indexOf(m[1]);
      if (m[2]) { d = new Date(now.getFullYear(), now.getMonth(), Number(m[2])); if (d < now) d = new Date(now.getFullYear(), now.getMonth() + 1, Number(m[2])); }
      else { d = addDays(now, (wd - now.getDay() + 7) % 7 || 7); if (/que viene|proximo/.test(low) && daysBetween(now, d) < 7 && now.getDay() !== 0) d = addDays(d, 7); guess = true; }
    }
    else if (/pasado manana/.test(low)) d = addDays(now, 2);
    else if (/manana/.test(low)) d = addDays(now, 1);
    else if (/\bhoy\b/.test(low)) d = now;
    else if ((m = low.match(/(\d+)\s+dias/))) d = addDays(now, Number(m[1]));
    else if (/fin de mes/.test(low)) d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    else if (/semana que viene|proxima semana/.test(low)) { d = addDays(now, (8 - now.getDay()) % 7 || 7); guess = true; }
    const day = d ? TR_WD[d.getDay()].slice(0, 3) + " " + pad(d.getDate()) + "/" + pad(d.getMonth() + 1) : "";
    // "20/10" ya es la fecha; "antes del jueves" se muestra con la fecha calculada al lado
    const label = /^\d{1,2}[\/\-]\d{1,2}/.test(t) ? day : trCap(t) + (day ? " (" + day + ")" : "");
    return { label, date: d ? iso(d) : "", guess };
  }
  // "A partir de la lectura del fallo" esconde un paso: "Leer el fallo"
  const TR_NOUN = { lectura: "leer", visualización: "ver", análisis: "analizar", observación: "observar", revisión: "revisar", escucha: "escuchar" };
  const TR_NOUN_RE = /^(?:a partir de|luego de|después de|tras|en base a|con base en|mediante)\s+(?:la|el)\s+(lectura|visualización|análisis|observación|revisión|escucha)\s+(?:de\s+)?(del?|la|los|las)?\s*/i;
  const trStart = (p) => {
    let prev;
    p = p.replace(/^[\s,;:.]+/, "");
    do { prev = p; p = p.replace(TR_SEQ, "").replace(TR_MODAL, "").replace(/^de\s+(?=\p{L}+(?:ar|er|ir)\b)/iu, "").trim(); } while (p !== prev);
    const nm = p.replace(/^[\s,;:.]+/, "").match(TR_NOUN_RE);
    if (nm) return TR_NOUN[nm[1].toLowerCase()] + " " + ((nm[2] || "").toLowerCase() === "del" ? "el " : nm[2] ? nm[2].toLowerCase() + " " : "") + p.replace(/^[\s,;:.]+/, "").slice(nm[0].length);
    // "Los alumnos deberán seleccionar..." → "seleccionar..."
    if (!trVerb(trFirst(p))) { const sm = p.match(/^(?:\p{L}+\s+){1,4}?(?:deber(?:á|án|ás)|deben|tienen que|tendrán que|van a)\s+/iu); if (sm) p = p.slice(sm[0].length); }
    return p;
  };
  function trSegments(text) {
    const segs = [];
    const add = (txt, cat) => {
      if (!txt.trim()) return;
      // La fecha va aparte aunque esté adentro de otra parte
      const d = cat !== "fecha" && txt.match(TR_DATE);
      if (d) { add(txt.slice(0, d.index), cat); segs.push({ text: d[0], cat: "fecha" }); add(txt.slice(d.index + d[0].length), cat); }
      else if (!trClean(txt) && segs.length) segs[segs.length - 1].text += txt; // un punto suelto va con la parte anterior
      else segs.push({ text: txt, cat });
    };
    // Lo que está entre comillas no se corta (títulos, frases citadas)
    const quotes = [];
    const t = text.replace(/\s+/g, " ").trim()
      .replace(/"[^"]*"|“[^”]*”|«[^»]*»/g, (q) => "\u0001" + (quotes.push(q) - 1) + "\u0002");
    const back = (s) => s.replace(/\u0001(\d+)\u0002/g, (_, i) => quotes[i]);
    for (const s0 of t.match(/[^.!?;]+(?:[.!?;]+|$)\s*/g) || []) {
      const s = s0.trim();
      if (!s) continue;
      const sp = s0.endsWith(" ") ? " " : "";
      if (/^(?:se\s+evalu|se\s+evalú|criterios?\b|la\s+evaluación|evaluación:)/i.test(s)) { add(back(s) + sp, "evalua"); continue; }
      if (/^(?:el\s+)?(?:plazo|fecha de entrega|fecha límite|vence)/i.test(s)) { add(back(s) + sp, "fecha"); continue; }
      if (/^(?:se\s+entrega|la\s+entrega|entrega:|formato|el\s+trabajo\s+se\s+entrega|extensión|subir|enviar|entregar\s+(?:en|por|al|a\s+trav))/i.test(s)) { add(back(s) + sp, "entregar"); continue; }
      if (/^(?:tener en cuenta|tené en cuenta|tengan en cuenta|importante|considerar|condiciones?:|recordá|recuerden|no\s+(?:se\s+)?(?:puede|pueden|debe|deben|vale))/i.test(s)) { add(back(s) + sp, "cuenta"); continue; }
      // "..., teniendo en cuenta X, Y y Z" es "Qué tener en cuenta"
      let body = s, tail = "";
      const tc = s.match(/,?\s*(?:teniendo en cuenta|considerando|tomando en cuenta|respetando|sin\s+(?:usar|superar|exceder))\s+.+$/i);
      if (tc) { body = s.slice(0, tc.index); tail = s.slice(tc.index); }
      // Cortar en pasos: en "después/luego/finalmente" y en ", " o " y " seguidos de un verbo
      const cuts = [0];
      for (const m of body.matchAll(/,\s*(?:y\s+|e\s+)?|\s+[ye]\s+|\s+(?=(?:después|luego|finalmente|por último|a continuación)\b)/giu)) {
        const after = body.slice(m.index + m[0].length);
        if (trVerb(trFirst(trStart(after))) || /^(?:después|luego|finalmente|por último|a continuación)\b/i.test(after)) cuts.push(m.index);
      }
      cuts.push(body.length);
      const parts = [];
      for (let i = 0; i < cuts.length - 1; i++) parts.push(body.slice(cuts[i], cuts[i + 1]));
      parts.forEach((p, i) => {
        const cat = trVerb(trFirst(trStart(p))) ? "paso" : parts.length > 1 || /\b(?:individual|grupal|en grupos?|obligatori|máximo|mínimo|sin|no se|solo|sólo|debe|deben|tiene que|importante)\b/i.test(p) ? "cuenta" : "otro";
        add(back(p) + (i === parts.length - 1 && !tail ? sp : ""), cat);
      });
      if (tail) add(back(tail) + sp, "cuenta");
    }
    return segs;
  }
  const trClean = (s) => s.replace(/^[\s,;:.]+|[\s,;:.]+$/g, "").replace(/^(?:y|e)\s+/i, "");
  function trBuild(segs, text) {
    const of = (cat) => segs.filter((s) => s.cat === cat).map((s) => trClean(s.text)).filter(Boolean);
    const steps = [], verbs = [], cuenta = [], dates = [];
    let waiting = [];
    segs.forEach((sg) => {
      const p = trClean(sg.text);
      if (!p) return;
      if (sg.cat === "fecha") {
        // Cada fecha va con el paso que la precede (o con el siguiente, si está antes)
        const w = trWhen(p);
        if (steps.length) dates.push(Object.assign(w, { step: steps.length - 1 })); else waiting.push(w);
        return;
      }
      if (sg.cat !== "paso") return;
      const q = trStart(p), inf = trVerb(trFirst(q));
      const step = inf ? trCap(inf + q.slice(trFirst(q).length)) : trCap(q);
      if (/^(?:en\s+|con\s+|de\s+)/i.test(q) && steps.length && !inf) steps[steps.length - 1] += ", " + q; // una parte suelta movida a "Hacer"
      else if (step) {
        steps.push(step); verbs.push(inf);
        waiting.forEach((w) => dates.push(Object.assign(w, { step: steps.length - 1 }))); waiting = [];
      }
    });
    waiting.forEach((w) => dates.push(Object.assign(w, { step: -1 })));
    const stepDue = steps.map((_, i) => dates.length > 1 ? dates.filter((d) => d.step === i).map((d) => d.label).join(" · ") : "");
    of("cuenta").forEach((c) => cuenta.push(...trList(c.replace(TR_SEQ, "").replace(/^(?:teniendo|tomando|tener|tené|tengan) en cuenta(?: que)?:?\s*|^considerando\s*|^considerar:?\s*|^importante:?\s*|^condiciones?:\s*/i, ""))));
    const plain = text.replace(/\s+/g, " ");
    const c = plain.match(/comuni(?:que|car|quen)\s+(.+?)(?:,|\.|\s+teniendo|\s+para\s|$)/i);
    // ", fundamentándolo con los artículos..." también es algo a tener en cuenta
    steps.forEach((st) => {
      const g = st.match(/,\s*(\p{L}+?)([aá]ndo|i[eé]ndo)(?:lo|la|los|las)?\s+(.+)$/u);
      if (g) cuenta.push(trCap(/^[aá]/.test(g[2]) ? g[1] + "ar " + g[3] : g[1] + g[2].replace("é", "e") + " " + g[3]));
    });
    // Frases entre comillas dentro de un paso (que no sean lo que hay que leer): idea clave
    steps.forEach((st, i) => {
      if (TR_READ.test(verbs[i] || "") || /comuni(?:que|car|quen)/i.test(st)) return;
      for (const m of st.matchAll(/"[^"]*"|“[^”]*”|«[^»]*»/g)) cuenta.push("Idea clave: " + m[0]);
    });
    const lim = plain.match(/(?:no más de|como máximo|máximo de|mínimo de|al menos|entre \d+ y \d+|hasta)\s+\d*\s*(?:páginas|carillas|palabras|caracteres|líneas|minutos|diapositivas|imágenes)\b|\b\d+\s*(?:páginas|carillas|palabras|caracteres|líneas|minutos|diapositivas)\b/gi);
    if (lim) cuenta.push(...lim.map((x) => "Extensión: " + x));
    const ent = of("entregar").join(" ");
    const fm = ent.match(/\b(PDF|JPG|PNG|Word|editable|impres[oa]|maqueta|archivo abierto|AI|PSD|InDesign|campus|aula virtual|mail)\b/gi);
    const formats = fm ? Array.from(new Set(fm.map((s) => /^(pdf|jpg|png|ai|psd)$/i.test(s) ? s.toUpperCase() : s.toLowerCase() === "editable" ? "archivo editable" : /^word$/i.test(s) ? "Word" : s.toLowerCase()))) : [];
    let entregar = formats.length ? formats.join(" + ") : trCap(ent.replace(/^se\s+entregan?\s+/i, "").replace(/^entrega:?\s*/i, ""));
    let guess = false;
    if (!entregar && verbs.some((v) => /^(escribir|reescribir|redactar|narrar)$/.test(v))) { entregar = "Seguramente el texto que escribas"; guess = true; }
    // Si hay varias fechas, la de la entrega es la última
    const last = dates.slice().sort((a, b) => (a.date || "0") < (b.date || "0") ? -1 : 1).pop();
    const fecha = last ? last.label : "";
    const evalua = of("evalua").flatMap((e) => trList(e.replace(/^(?:se\s+(?:evalua(?:rá)?|evaluará|evalúa|van a evaluar)|criterios?(?: de evaluación)?:?|(?:la\s+)?evaluación:?)\s*/i, "")));
    const asks = [];
    if (!fecha) asks.push("¿Cuándo se entrega?");
    if (!formats.length && (!entregar || guess)) asks.push("¿En qué formato y con qué extensión se entrega?");
    if (!evalua.length) asks.push("¿Qué se va a evaluar?");
    return {
      steps, stepDue, dates, due: last ? last.date : "", guessDate: dates.some((d) => d.guess), comunicar: c ? c[1].replace(/^(el|la|los|las)\s+/i, "").trim() : "",
      cuenta: Array.from(new Set(cuenta.map((x) => x.trim()).filter(Boolean))), entregar, fecha, evalua: Array.from(new Set(evalua)), asks,
      paso: steps.length === 1 && c ? "Definir el concepto en una frase" : steps[0] || "Releer la consigna y marcar lo que no entiendo"
    };
  }
  let trSegs = [], trSel = -1, trRes = null;
  const TR_ASK = "No lo dice la consigna";
  function renderTr() {
    const r = trRes = trBuild(trSegs, $("#tr-input").value);
    // Consigna resaltada por partes
    let n = 0;
    $("#tr-text").innerHTML = trSegs.map((s, i) => `<span role="button" tabindex="0" class="frag f-${s.cat}${i === trSel ? " sel" : ""}" data-i="${i}" aria-pressed="${i === trSel}" aria-label="${esc(TR_CATS[s.cat].name)}: ${esc(trClean(s.text))}"><span class="ftag" aria-hidden="true">${s.cat === "paso" ? ++n : TR_CATS[s.cat].tag}</span>${esc(s.text.trim().replace(/^[,;]\s*/, ""))}</span>`).join(" ");
    $("#tr-legend").innerHTML = Object.entries(TR_CATS).map(([k, v]) => `<span class="fkey f-${k}">${v.name}</span>`).join("");
    const pick = $("#tr-pick");
    pick.hidden = trSel < 0;
    if (trSel >= 0) {
      pick.innerHTML = `<span class="small"><b>Esta parte es:</b> "${esc(trClean(trSegs[trSel].text))}"</span>
        <div class="row">${Object.entries(TR_CATS).map(([k, v]) => `<button type="button" class="btn ghost fpick f-${k}" data-cat="${k}" aria-pressed="${trSegs[trSel].cat === k}">${v.name}</button>`).join("")}</div>`;
    }
    const cell = (lbl, val, cls) => `<div class="tp-cell ${cls || ""}"><span class="lbl">${lbl}</span><span${val ? "" : ' class="ask"'}>${esc(val || TR_ASK)}</span></div>`;
    const list = (lbl, arr, cls) => arr.length ? `<div class="tp-cell ${cls || ""}"><span class="lbl">${lbl}</span><ul class="scribble-list">${arr.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : cell(lbl, "", cls);
    $("#tr-card").innerHTML = `
      <span class="tp-title">Paso a paso</span>
      ${r.steps.length ? `<ol class="tp-steps">${r.steps.map((s, i) => `<li><span>${esc(s)}${r.stepDue[i] ? `<span class="due">${esc(r.stepDue[i])}</span>` : ""}</span></li>`).join("")}</ol>` : `<p class="ask">No encontramos acciones. Tocá en la consigna las partes que dicen qué hacer y marcalas como "Qué hacer".</p>`}
      <div class="tp-grid">${r.comunicar ? cell("Qué comunicar", r.comunicar) : ""}${list("Qué tener en cuenta", r.cuenta)}${cell("Qué entregar", r.entregar)}${cell(r.dates.length > 1 ? "Fecha final" : "Fecha", r.fecha, "date")}</div>
      ${r.guessDate ? `<p class="small muted">Las fechas con día de la semana están calculadas desde hoy. Si la consigna es de otra semana, ajustalas en "Dividir la entrega".</p>` : ""}
      ${r.evalua.length ? list("Se evalúa", r.evalua) : ""}
      ${r.asks.length ? list("Preguntale al docente", r.asks, "asks") : ""}
      ${cell("Primer paso", r.paso, "key")}`;
    store.set("tr", { input: $("#tr-input").value, segs: trSegs });
  }
  function runTr() {
    trSegs = trSegments($("#tr-input").value);
    trSel = -1;
    $("#tr-msg").textContent = trSegs.length ? "" : "Pegá una consigna primero.";
    renderTr();
  }
  $("#tr-run").onclick = runTr;
  const trFrag = (e) => {
    const b = e.target.closest(".frag"); if (!b) return;
    if (e.type === "keydown") { if (e.key !== "Enter" && e.key !== " ") return; e.preventDefault(); }
    trSel = trSel === Number(b.dataset.i) ? -1 : Number(b.dataset.i);
    renderTr();
    if (trSel >= 0) $("#tr-pick .fpick[aria-pressed=true]")?.focus();
  };
  $("#tr-text").addEventListener("click", trFrag);
  $("#tr-text").addEventListener("keydown", trFrag);
  $("#tr-pick").addEventListener("click", (e) => {
    const b = e.target.closest(".fpick"); if (!b || trSel < 0) return;
    const i = trSel;
    trSegs[i].cat = b.dataset.cat; trSel = -1;
    renderTr();
    $(`#tr-text .frag[data-i="${i}"]`)?.focus();
  });
  const trSaved = store.get("tr", null);
  if (trSaved && Array.isArray(trSaved.segs)) { $("#tr-input").value = trSaved.input; trSegs = trSaved.segs; renderTr(); }
  else runTr();
  $("#tr-input").addEventListener("input", () => store.set("tr", Object.assign(store.get("tr", {}), { input: $("#tr-input").value })));
  $("#tr-copy").onclick = () => {
    const r = trRes;
    const lines = ["PASO A PASO:", ...r.steps.map((s, i) => (i + 1) + ". " + s + (r.stepDue[i] ? " (" + r.stepDue[i] + ")" : ""))];
    if (r.comunicar) lines.push("QUÉ COMUNICAR: " + r.comunicar);
    lines.push("QUÉ TENER EN CUENTA: " + (r.cuenta.join(", ") || TR_ASK), "QUÉ ENTREGAR: " + (r.entregar || TR_ASK), "FECHA: " + (r.fecha || TR_ASK));
    if (r.evalua.length) lines.push("SE EVALÚA: " + r.evalua.join(", "));
    if (r.asks.length) lines.push("PREGUNTAR AL DOCENTE: " + r.asks.join(" "));
    lines.push("PRIMER PASO: " + r.paso);
    copyText(lines.join("\n"), $("#tr-msg"));
  };
  $("#tr-toplan").onclick = () => {
    const r = trRes;
    dv.title = (r.steps[0] || dv.title).slice(0, 60);
    if (r.due) dv.due = r.due;
    // Con dos pasos o más, las etapas son los pasos de la consigna (más revisar y entregar)
    if (r.steps.length > 1) dv.stages = [...r.steps, "Revisar contra la consigna y entregar"].map((t, i) => ({ text: t, done: false, date: (r.dates.find((d) => d.step === i) || {}).date || "" }));
    else dv.stages[0].text = r.paso;
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
  const MAP_T = 0.28; // segundos que tarda en cargarse cada tramo
  function renderMap(prev) {
    const anim = prev !== undefined && prev !== mapCur && !isCalm();
    const fwd = anim && mapCur > prev;
    $("#map").innerHTML = mapSteps.map((s, i) => {
      // Al avanzar, los tramos se cargan de a uno; al volver, se descargan del último al primero
      let fill = "", node = "";
      if (fwd && i > prev && i <= mapCur) fill = ` class="in" style="--d:${(i - prev - 1) * MAP_T + 0.05}s"`;
      if (anim && !fwd && i > mapCur && i <= prev) fill = ` class="out" style="--d:${(prev - i) * MAP_T * 0.6}s"`;
      if (fwd && i >= prev && i < mapCur) node = ` pop" style="--d:${(i - prev) * MAP_T}s`;
      if (anim && i === mapCur) node = ` ring" style="--d:${fwd ? (mapCur - prev) * MAP_T : (prev - mapCur) * MAP_T * 0.6}s`;
      return `
      <button class="map-step ${i < mapCur ? "passed" : ""} ${i === mapCur ? "current" : ""}" type="button" role="listitem" data-i="${i}" aria-current="${i === mapCur ? "step" : "false"}">
        ${i ? `<i class="link" aria-hidden="true"><b${fill}></b></i>` : ""}<span class="node${node}">${i < mapCur ? "✓" : i + 1}</span><span>${esc(s[0])}</span>
      </button>`;
    }).join("");
    const s = mapSteps[mapCur];
    $("#map-detail").innerHTML = `<span class="eyebrow">Estás en: ${esc(s[0])}</span><p>${esc(s[1])}</p><p class="small muted">${esc(s[2])}</p>`;
    $$("#map .map-step").forEach((b) => b.onclick = () => {
      const from = mapCur;
      mapCur = Number(b.dataset.i); store.set("map", mapCur); renderMap(from);
      $(`#map .map-step[data-i="${mapCur}"]`).focus();
    });
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
    // Para que nada "tiemble", durante el movimiento no se reacomoda ningún texto: el recuadro anima su ancho y alto,
    // el título ya tiene su tamaño final y se agranda con una escala (sin recalcular letras), y el texto de adentro
    // queda quieto e invisible hasta que el recuadro termina (recién ahí se ensambla).
    const morph = (el, first, firstTitle) => {
      const title = $(".concept-title", el), body = $(".concept-body", el);
      const last = el.getBoundingClientRect(), lastTitle = title.getBoundingClientRect();
      const s = firstTitle.height / lastTitle.height;
      const dy = (firstTitle.top - first.top) - (lastTitle.top - last.top);
      if (!body.hidden) body.style.width = `${body.getBoundingClientRect().width}px`;
      el.style.transition = title.style.transition = "none";
      Object.assign(el.style, { width: `${first.width}px`, height: `${first.height}px`,
        transform: `translate(${first.left + first.width / 2 - last.left - last.width / 2}px, ${first.top - last.top}px)` });
      title.style.transformOrigin = "50% 0";
      title.style.transform = `translateY(${dy}px) scale(${s})`;
      el.getBoundingClientRect();
      const t = `${DUR}ms ${EASE}`;
      el.style.transition = `transform ${t}, width ${t}, height ${t}`;
      title.style.transition = `transform ${t}`;
      Object.assign(el.style, { width: `${last.width}px`, height: `${last.height}px`, transform: "" });
      title.style.transform = "";
      clearTimeout(el._morph);
      el._morph = setTimeout(() => {
        Object.assign(el.style, { width: "", height: "", transition: "" });
        Object.assign(title.style, { transition: "", transformOrigin: "" });
        body.style.width = "";
      }, DUR + 50);
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
        const first = item.getBoundingClientRect(), firstTitle = $(".concept-title", item).getBoundingClientRect();
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
          if (!calm) morph(item, first, firstTitle);
          gone = setTimeout(() => concepts.classList.add("gone"), calm ? 0 : DUR);
        } else {
          setOpen(item, false);
          item.classList.remove("open");
          concepts.classList.remove("focused", "gone");
          others.forEach((o) => Object.assign(o.style, { position: "", left: "", top: "", width: "" }));
          if (!calm) morph(item, first, firstTitle);
          // Los otros dos reaparecen en su lugar con el mismo fundido, mientras el elegido vuelve.
          requestAnimationFrame(() => requestAnimationFrame(() => concepts.classList.remove("fading")));
        }
      });
    });
  }

  /* ---------- Estado inicial ---------- */
  const hash = (location.hash || "").slice(1);
  /* ---------- Tarjeta de desarrollador ---------- */
  // Estrellas azules y naranjas: dos capas de puntos (box-shadow) que suben sin fin, como en el código de Ale
  $$(".dev-card .dev-stars").forEach((box) => {
    const W = 400, H = 600;
    [[1, 40, 40], [2, 12, 80]].forEach(([size, n, t], k) => {
      const pts = Array.from({ length: n }, (_, i) => `${Math.round(Math.random() * W)}px ${Math.round(Math.random() * H)}px ${i % 2 ? "var(--brand)" : "var(--brand-2)"}`);
      Object.assign(box.children[k].style, { width: size + "px", height: size + "px", boxShadow: pts.join(",") });
      box.children[k].style.setProperty("--t", t + "s");
      box.children[k].style.setProperty("--h", H + "px");
    });
  });
  // Dorso: medio segundo después de darse vuelta, el contenido se deshace en polvo (como el chasquido de Thanos) y la tarjeta queda vacía
  $$(".dev-card").forEach((card) => {
    const face = $(".dev-front", card), role = $(".dev-role", card), stars = $(".dev-stars", card);
    role.innerHTML = role.textContent.split(" ").map((w) => `<span>${esc(w)}</span>`).join(" ");
    const cv = document.createElement("canvas");
    cv.className = "dev-dust";
    face.appendChild(cv);
    let timer = 0, raf = 0, done = false, over = false;
    const showing = () => over || card.classList.contains("flipped");
    function reset() {
      clearTimeout(timer); cancelAnimationFrame(raf);
      face.classList.remove("dusting", "dusted");
      cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
      done = false;
    }
    function snap() {
      if (done || !showing()) return;
      done = true;
      if (isCalm()) { face.classList.add("dusting", "dusted"); return; }
      const W = face.offsetWidth, H = face.offsetHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = W * dpr; cv.height = H * dpr;
      // Se dibuja en un lienzo lo que se ve (POV + texto) para tomar sus puntos
      const off = document.createElement("canvas"); off.width = W; off.height = H;
      const g = off.getContext("2d");
      const box = face.getBoundingClientRect(), k = W / box.width;
      const at = (el) => { const r = el.getBoundingClientRect(); return [(r.left - box.left) * k, (r.top - box.top) * k, r.width * k, r.height * k]; };
      const img = $$(".dev-pov", card).find((x) => x.offsetWidth);
      if (img) g.drawImage(img, ...at(img));
      const cs = getComputedStyle(role);
      g.font = cs.font; g.fillStyle = cs.color; g.textBaseline = "top";
      $$("span", role).forEach((w) => { const [x, y] = at(w); g.fillText(w.textContent, x, y + 1); });
      let px;
      try { px = g.getImageData(0, 0, W, H).data; } catch (e) { face.classList.add("dusting", "dusted"); return; }
      const parts = [], S = 2;
      for (let y = 0; y < H; y += S) for (let x = 0; x < W; x += S) {
        const i = (y * W + x) * 4;
        if (px[i + 3] > 60) parts.push({ x, y, c: `rgb(${px[i]},${px[i + 1]},${px[i + 2]})`, d: (x / W) * 0.7 + Math.random() * 0.5, vx: 25 + Math.random() * 55, vy: -(15 + Math.random() * 45), l: 0.8 + Math.random() * 0.6 });
      }
      face.classList.add("dusting");
      const ctx = cv.getContext("2d"), t0 = performance.now();
      const end = Math.max(...parts.map((p) => p.d + p.l), 1);
      (function frame(now) {
        const t = (now - t0) / 1000;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        for (const p of parts) {
          const s = t - p.d;
          if (s > p.l) continue;
          const u = Math.max(0, s), a = s <= 0 ? 1 : 1 - s / p.l;
          ctx.globalAlpha = a;
          ctx.fillStyle = p.c;
          ctx.fillRect(p.x + p.vx * u + Math.sin(p.y + u * 6) * 3 * u, p.y + p.vy * u, S, S);
        }
        if (t < end) raf = requestAnimationFrame(frame);
        else { ctx.clearRect(0, 0, W, H); face.classList.add("dusted"); }
      })(t0);
    }
    // 0,5 s de giro + 1,5 s de quieta
    const arm = () => { clearTimeout(timer); if (!done) timer = setTimeout(snap, 2000); };
    const disarm = () => { clearTimeout(timer); setTimeout(() => { if (!showing()) reset(); }, 300); };
    card.addEventListener("mouseenter", () => { over = true; arm(); });
    card.addEventListener("mouseleave", () => { over = false; disarm(); });
    // Con dedo o teclado no hay hover: tocar o Enter da vuelta la tarjeta
    const toggle = () => { card.classList.toggle("flipped"); card.classList.contains("flipped") ? arm() : disarm(); };
    card.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") toggle(); });
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  });

  goSub(store.get("sub", "primer"));
  goTab(sectionIds.includes(hash) ? hash : "inicio", false);
  // El navegador salta solo hasta el #ancla al cargar: la pestaña tiene que arrancar desde arriba.
  if (hash) window.addEventListener("load", () => window.scrollTo(0, 0));
})();
