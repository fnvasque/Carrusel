/* Runtime del reel animado: lee window.__REEL_TIMING__ y las marcas data-anim,
 * arma una timeline maestra pausada y expone window.__reel = { duration, seek }.
 * Sin rebotes: solo easings power*.out / power*.in / none. */
window.__reelErrors = [];
document.fonts.ready.then(function () {
  try {
    gsap.registerPlugin(SplitText);
    const T = window.__REEL_TIMING__;
    const scenes = Array.from(document.querySelectorAll("[data-scene]"));
    const master = gsap.timeline({ paused: true });
    const OVERLAP = 0.6; // el siguiente elemento entra al 60% del anterior
    const HOOK_LEAD = 0.15; // s que el hook arranca adelantado (miniatura con contenido)

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

    // Las from() usan immediateRender (por defecto en from): el estado inicial
    // (oculto) se pinta al crearlas, así ninguna entrada muestra su estado
    // final antes de empezar, aunque su sub-timeline arranque tarde.
    function entrance(el, sub, at) {
      const kind = el.getAttribute("data-anim");
      if (kind === "rise") {
        sub.from(el, { y: 40, autoAlpha: 0, duration: 0.45, ease: "power3.out" }, at);
        return 0.45;
      }
      if (kind === "stagger") {
        const kids = Array.from(el.children);
        if (kids.length === 0) return 0;
        sub.from(kids, { y: 40, autoAlpha: 0, duration: 0.45, ease: "power3.out", stagger: 0.12 }, at);
        return 0.45 + 0.12 * (kids.length - 1);
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
        return total;
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
      // Pausada hasta colgarla de la maestra (en la escena 0, vía tweenFromTo).
      const sub = gsap.timeline({ paused: true });
      let cursor = 0;
      Array.from(scene.querySelectorAll("[data-anim]")).forEach(function (el) {
        const kind = el.getAttribute("data-anim");
        if (kind === "bg" || kind === "pop") return;
        const len = entrance(el, sub, cursor);
        cursor += len * OVERLAP;
      });
      const natural = sub.duration();
      if (natural > 0) {
        if (natural > s.budget) sub.timeScale(natural / s.budget);
        if (i === 0) {
          // El hook arranca sus entradas ya avanzadas HOOK_LEAD s (como si
          // empezara en t = −HOOK_LEAD): el cuadro 0 (miniatura) no sale vacío.
          const from = Math.min(HOOK_LEAD * sub.timeScale(), natural);
          // immediateRender: el estado adelantado ya se pinta en el cuadro 0.
          if (from < natural) master.add(sub.tweenFromTo(from, natural, { immediateRender: true }), 0);
          else sub.progress(1);
        } else {
          master.add(sub.paused(false), s.start + T.transition / 2);
        }
      } else {
        sub.kill();
      }
    });

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
