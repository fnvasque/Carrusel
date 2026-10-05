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
        const pop = el.querySelector('[data-anim="pop"]');
        if (pop) pop.dataset.accent = pop.style.color; // acento original, para tests
        // SplitText conserva el span anidado de la palabra clave y divide sus
        // palabras dentro de él.
        const split = new SplitText(el, { type: "words", wordsClass: "reel-word" });
        const words = split.words;
        if (words.length === 0) return 0;
        sub.from(words, { yPercent: 60, autoAlpha: 0, duration: 0.45, ease: "power4.out", stagger: 0.06 }, at);
        let len = 0.45 + 0.06 * (words.length - 1);
        if (pop) {
          const parentColor = getComputedStyle(el).color;
          sub.from(pop, { color: parentColor, duration: 0.3, ease: "power2.out" }, at + len);
          // El span de la palabra clave es inline (transform no aplica): se
          // escalan sus palabras, que SplitText deja como inline-block.
          const popWords = Array.from(pop.querySelectorAll(".reel-word"));
          const scaled = popWords.length ? popWords : [pop];
          sub.from(scaled, { scale: 0.9, duration: 0.3, ease: "power2.out", transformOrigin: "50% 60%" }, at + len);
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
        sub.from(el, { scaleX: 0, duration: 0.4, ease: "power2.out" }, at);
        return 0.4;
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
      const sub = gsap.timeline();
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
        master.add(sub, i === 0 ? 0 : s.start + T.transition / 2);
      } else {
        sub.kill();
      }
    });

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
