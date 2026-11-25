/* Movimiento general (inspirado en la página de referencia que pasó Ale, 2026-11-25):
   1. Títulos que aparecen palabra por palabra desde abajo (máscara).
   2. Tarjetas y bloques que suben y aparecen al entrar en pantalla, de a una.
   3. Barra de progreso de lectura arriba de todo.
   4. Paralaje suave en los títulos de portada.
   5. Botón redondo "volver arriba".
   Con "Sin animaciones" (html.calm) todo se muestra de una y nada se mueve. */
(function () {
  "use strict";
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const root = document.documentElement;
  const calm = () => root.classList.contains("calm");
  const IO = "IntersectionObserver" in window;

  /* 1. Títulos: cada palabra en una máscara */
  const TITLES = "#que-es h1, .split-head h2, .band-pad > .lead > h2, .band-pad > .lead > h3, #tres-conceptos h2, #mitos-band h2, .closing-text";
  const split = (el) => {
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.nodeValue.split(/(\s+)/).forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(" ")); return; }
            const w = document.createElement("span"); w.className = "mw";
            const s = document.createElement("span"); s.textContent = p; s.style.setProperty("--wi", i++);
            w.appendChild(s); frag.appendChild(w);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1 && !n.matches("img, svg, br")) walk(n);
      });
    };
    walk(el);
    el.classList.add("m-split");
  };
  $$(TITLES).forEach((el) => { if (!el.querySelector("img")) split(el); });

  /* 2. Bloques que aparecen */
  const BLOCKS = [".line-card", ".tp-card", ".vs-col", ".area", ".person:not(.dev-card)", ".dev-card", ".dl-card", ".myth",
    ".tips > li", ".before-after > *", "#herramientas .panel", "#docentes .panel", ".contact > .panel", ".drop", ".car-body"].join(", ");
  const mark = () => {
    $$(BLOCKS).forEach((el) => {
      if (el.classList.contains("m-rv")) return;
      el.classList.add("m-rv");
      const sibs = Array.from(el.parentElement.children).filter((c) => c.matches(BLOCKS));
      el.style.setProperty("--ri", Math.min(sibs.indexOf(el), 6));
    });
  };
  mark();

  const show = (el) => el.classList.add("m-in");
  const io = IO ? new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { show(e.target); io.unobserve(e.target); }
  }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }) : null;
  const watch = () => $$(".m-split:not(.m-in), .m-rv:not(.m-in)").forEach((el) => (io && !calm() ? io.observe(el) : show(el)));
  watch();
  /* tarjetas que arma el script más tarde (áreas, imprimibles, mitos) */
  let pend = false;
  new MutationObserver(() => {
    if (pend) return; pend = true;
    requestAnimationFrame(() => { pend = false; mark(); watch(); });
  }).observe(document.querySelector("main") || document.body, { childList: true, subtree: true });
  new MutationObserver(() => { if (calm()) $$(".m-split, .m-rv").forEach(show); }).observe(root, { attributes: true, attributeFilter: ["class"] });

  /* 3. Barra de progreso */
  const bar = document.createElement("div"); bar.className = "m-progress"; bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);

  /* 5. Volver arriba */
  const up = document.createElement("button");
  up.className = "m-up"; up.type = "button"; up.setAttribute("aria-label", "Volver arriba");
  up.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>';
  up.onclick = () => window.scrollTo({ top: 0, behavior: calm() ? "auto" : "smooth" });
  document.body.appendChild(up);

  /* 4. Paralaje de portadas */
  const PARA = $$("#que-es h1");
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const y = window.scrollY, max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    up.classList.toggle("on", y > 600);
    PARA.forEach((t) => { t.style.transform = calm() || y > innerHeight ? "" : `translateY(${(y * 0.22).toFixed(1)}px)`; });
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener("resize", onScroll);
  addEventListener("hashchange", () => requestAnimationFrame(onScroll));
  onScroll();

  /* 6. Título del Inicio que "se lee": arranca en letra fina y cada letra se va
     resaltando (pasa a la Unpovdiferente gruesa) una por una, como si alguien lo leyera.
     Cada palabra reserva el ancho de su versión gruesa para que las líneas no salten. */
  const hero = document.querySelector(".hero-title");
  if (hero) {
    const letters = [], words = [];
    const walkR = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.nodeValue.split(/(\s+)/).forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(" ")); return; }
            const w = document.createElement("span"); w.className = "rw"; words.push(w);
            Array.from(p).forEach((ch) => { const l = document.createElement("span"); l.className = "rl on"; l.textContent = ch; letters.push(l); w.appendChild(l); });
            frag.appendChild(w);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1) walkR(n);
      });
    };
    hero.setAttribute("aria-label", hero.textContent.replace(/\s+/g, " ").trim());
    walkR(hero);
    words.forEach((w) => w.setAttribute("aria-hidden", "true"));
    hero.classList.add("m-read");
    const measure = () => {
      const on = letters.map((l) => l.classList.contains("on"));
      words.forEach((w) => { w.style.width = ""; w.style.height = ""; });
      const size = () => words.map((w) => { const r = w.getBoundingClientRect(); return [r.width, r.height]; });
      letters.forEach((l) => l.classList.remove("on"));
      const thin = size();
      letters.forEach((l) => l.classList.add("on"));
      const bold = size();
      words.forEach((w, i) => {
        w.style.width = Math.max(thin[i][0], bold[i][0]).toFixed(2) + "px";

      });
      letters.forEach((l, i) => l.classList.toggle("on", on[i]));
    };
    let timer = null, wait = null;
    const read = () => {
      clearInterval(timer); clearTimeout(wait);
      if (calm()) { letters.forEach((l) => l.classList.add("on")); words.forEach((w) => { w.style.width = ""; w.style.height = ""; }); return; }
      /* arranca como está (gruesa); una "lupa" de pocas letras finas recorre el título
         y cada letra vuelve a la gruesa cuando la lectura sigue de largo */
      const W = 4;
      letters.forEach((l) => l.classList.add("on"));
      words.forEach((w) => { w.style.width = ""; w.style.height = ""; });
      let i = 0;
      wait = setTimeout(() => {
        measure();
        timer = setInterval(() => {
          if (i < letters.length) letters[i].classList.remove("on");
          if (i - W >= 0 && i - W < letters.length) letters[i - W].classList.add("on");
          i++;
          /* al terminar, el título vuelve a su armado normal (sin anchos reservados) */
          if (i > letters.length + W) { clearInterval(timer); words.forEach((w) => { w.style.width = ""; w.style.height = ""; }); }
        }, 60);
      }, 600);
    };
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(read);
    let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (words[0].style.width) measure(); }, 150); });
    /* volver a leerlo cada vez que se entra al Inicio */
    addEventListener("hashchange", () => { if (!location.hash || location.hash === "#inicio") read(); });
  }
})();
