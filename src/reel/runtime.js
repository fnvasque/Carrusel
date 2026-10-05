/* Runtime del reel animado: lee window.__REEL_TIMING__ y las marcas data-anim
 * (rise, stagger, words, type, strike, count, check, caret; bg y pop aparte),
 * arma una timeline maestra pausada y expone window.__reel = { duration, seek }.
 * La grilla [data-grid] deriva durante todo el reel.
 * Sin rebotes: solo easings power*.out / power*.in / none. */
window.__reelErrors = [];
document.fonts.ready.then(function () {
  try {
    gsap.registerPlugin(SplitText);
    const T = window.__REEL_TIMING__;
    const scenes = Array.from(document.querySelectorAll("[data-scene]"));
    const master = gsap.timeline({ paused: true });
    const OVERLAP = 0.6; // el siguiente elemento entra al 60% del anterior
    const HOOK_ZOOM = 1.2; // s del acercamiento 1.04 → 1 del titular del hook
    const HOOK_POP_AT = 0.2; // s en que la palabra clave del hook empieza a pasar al acento
    const POP_DUR = 0.3;
    const COUNT_DUR = 1.2; // s que el número de un Stat tarda en contar desde 0
    const CHECK_DELAY = 0.1; // s tras la entrada de su bullet en que crece el ✓
    const CHECK_DUR = 0.3;
    const CARET_BLINK = 0.5; // s encendido / apagado del cursor del prompt
    const GRID_CELL_SECONDS = 8; // s que la grilla tarda en derivar una celda

    // Reemplaza los "\n" de los nodos de texto de `el` por <br>.
    function newlinesToBr(el) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (node) {
        if (node.nodeValue.indexOf("\n") === -1) return;
        const frag = document.createDocumentFragment();
        node.nodeValue.split("\n").forEach(function (part, j) {
          if (j > 0) frag.appendChild(document.createElement("br"));
          if (part) frag.appendChild(document.createTextNode(part));
        });
        node.parentNode.replaceChild(frag, node);
      });
    }

    // Tachado por línea: el <div data-anim="strike"> del template queda como
    // marcador oculto y se crea una barra por cada línea del texto hermano,
    // centrada en la línea y de su ancho, que se dibujan izquierda→derecha en
    // secuencia dentro de los mismos 0.4 s.
    function strike(marker, sub, at) {
      const DUR = 0.4;
      const wrap = marker.parentElement;
      const text = wrap.querySelector("p");
      if (!text) {
        sub.from(marker, { scaleX: 0, duration: DUR, ease: "power2.out" }, at);
        return DUR;
      }
      const range = document.createRange();
      range.selectNodeContents(text);
      // Una línea puede venir en varios rects (uno por nodo): se agrupan por fila.
      const lines = [];
      Array.from(range.getClientRects()).forEach(function (r) {
        if (r.width < 1) return;
        const row = lines.find(function (l) { return Math.abs(l.top - r.top) < r.height / 2; });
        if (row) {
          row.left = Math.min(row.left, r.left);
          row.right = Math.max(row.right, r.right);
        } else {
          lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height });
        }
      });
      if (lines.length === 0) return 0;
      const box = wrap.getBoundingClientRect();
      const thick = marker.getBoundingClientRect().height || 8;
      const color = getComputedStyle(marker).backgroundColor;
      marker.style.display = "none";
      const total = lines.reduce(function (a, l) { return a + (l.right - l.left); }, 0);
      let t = at;
      lines.forEach(function (l, j) {
        const bar = document.createElement("div");
        bar.setAttribute("data-reel-strike", String(j));
        Object.assign(bar.style, {
          position: "absolute",
          left: l.left - box.left + "px",
          top: (l.top + l.bottom) / 2 - box.top - thick / 2 + "px",
          width: l.right - l.left + "px",
          height: thick + "px",
          backgroundColor: color,
          transformOrigin: "left center",
        });
        wrap.appendChild(bar);
        // Velocidad constante: cada línea dura según su ancho.
        const d = (DUR * (l.right - l.left)) / total;
        sub.from(bar, { scaleX: 0, duration: d, ease: j === lines.length - 1 ? "power2.out" : "none" }, t);
        t += d;
      });
      return DUR;
    }

    // Formato de un valor de Stat para contar desde 0, con la misma lógica que
    // parseStatValue (Stat.tsx): un [.,] seguido de 3 dígitos y luego un no
    // dígito (o el fin) es separador de miles; el otro, decimal. Devuelve null
    // si no es numérico o es ambiguo ("1 de 3": hay dígitos en el sufijo).
    function countFormat(raw) {
      const m = raw.trim().match(/^([^\d-]*?)(-?\d+(?:[.,]\d+)*)(.*)$/);
      if (!m || /\d/.test(m[3])) return null;
      const num = m[2];
      const value = Number(num.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", "."));
      if (!Number.isFinite(value)) return null;
      const thousands = (num.match(/[.,](?=\d{3}(\D|$))/) || [null])[0];
      const dec = num.replace(/[.,](?=\d{3}(\D|$))/g, "").match(/([.,])(\d+)$/);
      const decimals = dec ? dec[2].length : 0;
      const decSep = dec ? dec[1] : thousands === "." ? "," : ".";
      return {
        value: value,
        text: function (v) {
          const fixed = Math.abs(v).toFixed(decimals).split(".");
          let int = fixed[0];
          if (thousands) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
          const sign = v < 0 && Math.abs(v) >= Math.pow(10, -decimals) / 2 ? "-" : "";
          return m[1] + sign + int + (decimals ? decSep + fixed[1] : "") + m[3];
        },
      };
    }

    // Las from() usan immediateRender (por defecto en from): el estado inicial
    // (oculto) se pinta al crearlas, así ninguna entrada muestra su estado
    // final antes de empezar, aunque su sub-timeline arranque tarde.
    // ctx: { hook: escena 0, carets: [] (cursores a encender al terminar de escribir) }.
    function entrance(el, sub, at, ctx) {
      const kind = el.getAttribute("data-anim");
      if (kind === "rise") {
        sub.from(el, { y: 40, autoAlpha: 0, duration: 0.45, ease: "power3.out" }, at);
        return 0.45;
      }
      if (kind === "stagger") {
        const kids = Array.from(el.children);
        if (kids.length === 0) return 0;
        sub.from(kids, { y: 40, autoAlpha: 0, duration: 0.45, ease: "power3.out", stagger: 0.12 }, at);
        // Los ✓ de cada bullet crecen junto con su entrada (algo después).
        kids.forEach(function (kid, j) {
          const checks = kid.querySelectorAll('[data-anim="check"]');
          if (checks.length) sub.from(checks, { scale: 0, duration: CHECK_DUR, ease: "power2.out" }, at + 0.12 * j + CHECK_DELAY);
        });
        return 0.45 + 0.12 * (kids.length - 1);
      }
      if (kind === "words" && ctx.hook) {
        // Hook (escena 0): el titular está completo y legible desde el cuadro 0;
        // se mueve con un acercamiento sutil y la palabra clave pasa al acento
        // antes de 0.6 s. Van en la maestra (no se escalan con el presupuesto).
        el.dataset.reelHook = "1";
        el.dataset.reelH0 = String(el.getBoundingClientRect().height);
        master.fromTo(el, { scale: 1.04 }, { scale: 1, transformOrigin: "50% 50%", duration: HOOK_ZOOM, ease: "power2.out", immediateRender: true }, 0);
        const pop = el.querySelector('[data-anim="pop"]');
        if (pop) {
          pop.dataset.accent = pop.style.color;
          master.fromTo(pop, { color: getComputedStyle(el).color }, { color: pop.style.color, duration: POP_DUR, ease: "power2.out", immediateRender: true }, HOOK_POP_AT);
        }
        return POP_DUR;
      }
      if (kind === "words") {
        let pop = el.querySelector('[data-anim="pop"]');
        if (pop) pop.dataset.accent = pop.style.color; // acento original, para tests
        // Altura con el corte de líneas del post, para detectar si el split lo cambia.
        const h0 = el.getBoundingClientRect().height;
        el.dataset.reelH0 = String(h0);
        // La palabra clave no se corta entre líneas al dividirla en palabras.
        if (pop) pop.style.whiteSpace = "nowrap";
        // SplitText conserva el span anidado de la palabra clave y divide sus
        // palabras dentro de él.
        const split = new SplitText(el, { type: "words", wordsClass: "reel-word" });
        if (el.getBoundingClientRect().height > h0 + 1) {
          // El split cambió el corte de líneas: se deshace y el bloque entra
          // entero (rise), conservando el pop por color.
          split.revert();
          pop = el.querySelector('[data-anim="pop"]');
          if (pop) pop.style.whiteSpace = "";
          el.dataset.reelSplitFallback = "1";
          console.warn("SplitText cambiaba el corte de líneas; el texto entra entero: " + el.textContent.slice(0, 60));
          sub.from(el, { y: 40, autoAlpha: 0, duration: 0.45, ease: "power3.out" }, at);
          if (!pop) return 0.45;
          sub.from(pop, { color: getComputedStyle(el).color, duration: 0.3, ease: "power2.out" }, at + 0.45);
          return 0.75;
        }
        const words = split.words;
        if (words.length === 0) return 0;
        // El span de la palabra clave es inline (transform no aplica): se
        // escalan sus palabras, que SplitText deja como inline-block. La escala
        // reducida se fija ANTES de crear la entrada de las palabras: así la
        // entrada la conserva (0.9 durante todo el titular) y el pop solo crece.
        const popWords = pop ? Array.from(pop.querySelectorAll(".reel-word")) : [];
        if (popWords.length) gsap.set(popWords, { scale: 0.9, transformOrigin: "50% 60%" });
        sub.from(words, { yPercent: 60, autoAlpha: 0, duration: 0.45, ease: "power4.out", stagger: 0.06 }, at);
        let len = 0.45 + 0.06 * (words.length - 1);
        if (pop) {
          const parentColor = getComputedStyle(el).color;
          sub.from(pop, { color: parentColor, duration: 0.3, ease: "power2.out" }, at + len);
          if (popWords.length) sub.fromTo(popWords, { scale: 0.9 }, { scale: 1, duration: 0.3, ease: "power2.out", immediateRender: false }, at + len);
          len += 0.3;
        }
        return len;
      }
      if (kind === "type") {
        // SplitText colapsa los saltos de línea de un texto pre-wrap: se pasan a
        // <br> antes de dividir. Se divide también por palabras para que el
        // texto corte entre palabras y no a mitad de una (como en el post).
        newlinesToBr(el);
        const split = new SplitText(el, { type: "words,chars" });
        const chars = split.chars;
        if (chars.length === 0) return 0;
        const total = Math.min(1.5, 0.03 * chars.length);
        sub.from(chars, { autoAlpha: 0, duration: 0.01, ease: "none", stagger: chars.length > 1 ? total / (chars.length - 1) : 0 }, at);
        // El cursor queda oculto mientras se escribe y parpadea al terminar.
        el.querySelectorAll('[data-anim="caret"]').forEach(function (caret) {
          ctx.carets.push({ el: caret, at: at + total });
        });
        return total;
      }
      if (kind === "caret") {
        // Cursor suelto (fuera de un type): parpadea desde su turno.
        ctx.carets.push({ el: el, at: at });
        return 0;
      }
      if (kind === "count") {
        // El número entra (rise) y cuenta desde 0; al terminar, el texto es el original.
        const raw = el.textContent;
        const fmt = countFormat(raw);
        sub.from(el, { y: 40, autoAlpha: 0, duration: 0.45, ease: "power3.out" }, at);
        if (!fmt) return 0.45;
        el.dataset.reelCount = raw;
        const proxy = { v: 0 };
        const paint = function () { el.textContent = proxy.v === fmt.value ? raw : fmt.text(proxy.v); };
        sub.fromTo(proxy, { v: 0 }, { v: fmt.value, duration: COUNT_DUR, ease: "power2.out", immediateRender: true, onUpdate: paint, onStart: paint }, at);
        paint();
        return 0.45;
      }
      if (kind === "check") {
        // ✓ suelto (fuera de un stagger): crece de 0 a 1.
        sub.from(el, { scale: 0, duration: CHECK_DUR, ease: "power2.out" }, at);
        return CHECK_DUR;
      }
      if (kind === "strike") {
        return strike(el, sub, at);
      }
      console.warn("data-anim desconocido: " + kind);
      return 0;
    }

    scenes.forEach(function (scene, i) {
      const s = T.scenes[i];
      const last = i === scenes.length - 1;
      // Visibilidad y transición de entrada/salida (empuje vertical).
      if (i === 0) {
        gsap.set(scene, { autoAlpha: 1 });
      } else {
        gsap.set(scene, { autoAlpha: 0 });
        master.fromTo(scene, { yPercent: 6, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: T.transition, ease: "power2.out", immediateRender: false }, s.start);
      }
      if (!last) {
        master.to(scene, { yPercent: -6, autoAlpha: 0, duration: T.transition, ease: "power2.in" }, s.start + s.dur - T.transition);
      }
      // Fondo: zoom lento durante toda la escena.
      const bg = scene.querySelector('[data-anim="bg"]');
      if (bg) master.fromTo(bg, { scale: 1.06 }, { scale: 1, duration: s.dur, ease: "none" }, s.start);
      // Entradas en orden de documento (bg y pop se manejan aparte; strike va
      // anidado dentro de un rise y se encadena igual). Se toma la lista antes
      // de dividir con SplitText para no recorrer nodos recién creados.
      // Pausada hasta colgarla de la maestra.
      const sub = gsap.timeline({ paused: true });
      const ctx = { hook: i === 0, carets: [] };
      let cursor = 0;
      Array.from(scene.querySelectorAll("[data-anim]")).forEach(function (el) {
        const kind = el.getAttribute("data-anim");
        if (kind === "bg" || kind === "pop") return;
        // Los ✓ de un checklist y el cursor de un type van con su contenedor.
        if (kind === "check" && el.parentElement.closest('[data-anim="stagger"]')) return;
        if (kind === "caret" && el.parentElement.closest('[data-anim="type"]')) return;
        const len = entrance(el, sub, cursor, ctx);
        cursor += len * OVERLAP;
      });
      // El hook (escena 0) arranca en 0: su titular ya está completo en el cuadro 0.
      const offset = i === 0 ? 0 : s.start + T.transition / 2;
      const natural = sub.duration();
      if (natural > 0) {
        if (natural > s.budget) sub.timeScale(natural / s.budget);
        master.add(sub.paused(false), offset);
      } else {
        sub.kill();
      }
      // Cursor: oculto hasta que termina de escribirse; luego on/off cada
      // CARET_BLINK s hasta el fin de la escena (sets: sin easing).
      const end = s.start + s.dur;
      ctx.carets.forEach(function (c) {
        gsap.set(c.el, { autoAlpha: 0 });
        let k = 0;
        for (let t = offset + c.at / sub.timeScale(); t < end; t += CARET_BLINK, k++) {
          master.set(c.el, { autoAlpha: k % 2 === 0 ? 1 : 0 }, +t.toFixed(4));
        }
      });
    });

    // Grilla: deriva diagonal lenta y continua (una celda cada
    // GRID_CELL_SECONDS s) durante todo el reel, igual en todas las escenas. La
    // capa sobra una celda por lado y el patrón se repite cada celda: el
    // desplazamiento se envuelve dentro de una celda y nunca deja bordes vacíos.
    const grids = Array.from(document.querySelectorAll("[data-grid]"));
    if (grids.length) {
      const cell = parseFloat(getComputedStyle(grids[0]).backgroundSize) || 120;
      const dist = (cell * T.total) / GRID_CELL_SECONDS;
      const wrap = gsap.utils.wrap(0, cell);
      master.fromTo(
        grids,
        { x: 0, y: 0 },
        {
          x: dist,
          y: -dist,
          duration: T.total,
          ease: "none",
          immediateRender: true,
          // x en [0, celda), y en (−celda, 0]: en 0 la grilla está en su lugar.
          modifiers: { x: gsap.utils.unitize(wrap), y: gsap.utils.unitize(function (v) { return -wrap(-v); }) },
        },
        0,
      );
    }

    // Barra de progreso de marca (solo reel): crece lineal 0→100% en todo el reel.
    const bar = document.querySelector("[data-reel-progress]");
    if (bar) master.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: T.total, ease: "none", immediateRender: true }, 0);

    // Fija la duración exacta del reel aunque la última tween termine antes.
    master.set({}, {}, T.total);
    master.seek(0, false);
    window.__reel = {
      duration: master.duration(),
      seek: function (t) { master.seek(t, false); },
    };
  } catch (e) {
    window.__reelErrors.push(String(e && e.stack ? e.stack : e));
  }
  window.__reelReady = true;
});
