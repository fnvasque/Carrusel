/*
 * Revisión visual del DOM (código de navegador plano; lo inyecta
 * src/render/revision.ts con addScriptTag). Define window.__revisarVisual(opts):
 *
 *   opts.comprobar: subconjunto de ["tilde", "puntuacion", "zona"]
 *   opts.zona:      { arriba, abajo } en px (solo para "zona")
 *   opts.altura:    alto del lienzo (por defecto innerHeight)
 *   opts.contexto:  texto para los motivos, o uno por escena (índice = escena)
 *
 * Devuelve { textos, hallazgos } del instante actual. window.__revisarSerie
 * (más abajo) recorre la timeline del reel con __reel.seek. Se mide lo que se pinta:
 * el carácter después de text-transform, su rect real (Range, incluye
 * transforms) y las métricas de la fuente computada (canvas measureText).
 */
(function () {
  if (typeof window.__revisarVisual === "function") return;

  var ACENTO = /[ÁÉÍÓÚÜÑ]/i;
  var CIERRE = /[,.;:!?…)»”]/;
  var BLANCO = /\s/;

  var lienzo = document.createElement("canvas").getContext("2d");
  var cacheMetricas = {};

  /** Métricas de `ch` con la fuente computada de `estilo` (en px de font-size). */
  function metricas(estilo, ch) {
    var fuente = estilo.fontStyle + " " + estilo.fontWeight + " " + estilo.fontSize + " " + estilo.fontFamily;
    var k = fuente + "\u0000" + ch;
    if (cacheMetricas[k]) return cacheMetricas[k];
    lienzo.font = fuente;
    var m = lienzo.measureText(ch);
    var r = {
      asc: m.fontBoundingBoxAscent,
      desc: m.fontBoundingBoxDescent,
      tintaArriba: m.actualBoundingBoxAscent,
      tintaAbajo: m.actualBoundingBoxDescent,
    };
    cacheMetricas[k] = r;
    return r;
  }

  /** Opacidad efectiva: producto de opacity del elemento y sus ancestros; 0 si algo lo oculta. */
  function opacidadEfectiva(el) {
    if (getComputedStyle(el).visibility !== "visible") return 0;
    var o = 1;
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
      var s = getComputedStyle(e);
      if (s.display === "none") return 0;
      o *= parseFloat(s.opacity);
      if (o === 0) return 0;
    }
    return o;
  }

  /** Texto tal como se pinta según text-transform. */
  function pintado(texto, estilo) {
    switch (estilo.textTransform) {
      case "uppercase": return texto.toLocaleUpperCase("es");
      case "lowercase": return texto.toLocaleLowerCase("es");
      default: return texto;
    }
  }

  function escenaDe(el, hayEscenas) {
    if (!hayEscenas) return 0;
    var s = el.closest("[data-scene]");
    return s ? Number(s.getAttribute("data-scene")) : -1;
  }

  window.__revisarVisual = function (opts) {
    opts = opts || {};
    var comprobar = opts.comprobar || [];
    var altura = opts.altura || window.innerHeight;
    var hayEscenas = !!document.querySelector("[data-scene]");
    var hallazgos = [];

    function contexto(escena) {
      var c = opts.contexto;
      if (Array.isArray(c)) return c[escena] != null ? c[escena] : "escena " + escena;
      return c != null ? c : "escena " + escena;
    }

    // --- Caracteres pintados, por escena y en orden de documento ---
    var chars = {}; // escena → [{ ch, rect, el, estilo, op, anton }]
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var rango = document.createRange();
    for (var nodo = walker.nextNode(); nodo; nodo = walker.nextNode()) {
      if (nodo.nodeType === 1) {
        // <br> separa palabras aunque no haya blanco en el texto.
        if (nodo.tagName === "BR") {
          var eb = escenaDe(nodo, hayEscenas);
          if (eb >= 0) (chars[eb] || (chars[eb] = [])).push({ ch: " ", blanco: true });
        }
        continue;
      }
      var el = nodo.parentElement;
      if (!el || el.closest("script,style")) continue;
      var escena = escenaDe(el, hayEscenas);
      if (escena < 0) continue;
      var estilo = getComputedStyle(el);
      var op = opacidadEfectiva(el);
      var fuente = nodo.textContent || "";
      var texto = pintado(fuente, estilo);
      var anton = /anton/i.test(estilo.fontFamily);
      var lista = chars[escena] || (chars[escena] = []);
      for (var i = 0; i < fuente.length && i < texto.length; i++) {
        var ch = texto[i];
        if (BLANCO.test(ch)) { lista.push({ ch: " ", blanco: true }); continue; }
        // Oculto: ni se mide (el reel tiene todas las escenas en el DOM a la vez).
        if (op <= 0) { lista.push({ ch: ch, oculto: true }); continue; }
        rango.setStart(nodo, i);
        rango.setEnd(nodo, i + 1);
        var r = rango.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) { lista.push({ ch: ch, oculto: true }); continue; }
        lista.push({ ch: ch, fuente: fuente[i], rect: r, el: el, estilo: estilo, op: op, anton: anton });
      }
    }

    /** Dos caracteres en la misma línea (solape vertical > 50 %); los ocultos no cortan. */
    function mismaLinea(x, y) {
      if (!x.rect || !y.rect) return true;
      var solape = Math.min(x.rect.bottom, y.rect.bottom) - Math.max(x.rect.top, y.rect.top);
      return solape / Math.min(x.rect.height, y.rect.height) > 0.5;
    }

    /** Palabra que contiene la posición `i` de `lista` (no blancos contiguos, sin puntuación). */
    function palabra(lista, i) {
      var a = i, b = i;
      while (a > 0 && !lista[a - 1].blanco && mismaLinea(lista[a - 1], lista[a])) a--;
      while (b < lista.length - 1 && !lista[b + 1].blanco && mismaLinea(lista[b], lista[b + 1])) b++;
      var s = "";
      for (var k = a; k <= b; k++) s += lista[k].ch;
      return s.replace(/^[,.;:!?…()«»“”"']+|[,.;:!?…()«»“”"']+$/g, "");
    }

    /** Línea base y escala de un carácter visible (escala = transform acumulado). */
    function geometria(c) {
      var m = metricas(c.estilo, c.ch);
      var s = c.rect.height / (m.asc + m.desc);
      return { m: m, s: s, base: c.rect.top + m.asc * s };
    }

    Object.keys(chars).forEach(function (k) {
      var escena = Number(k);
      var lista = chars[k];
      var visibles = lista.filter(function (c) { return c.rect; });

      if (comprobar.indexOf("tilde") >= 0) {
        var vistas = {};
        lista.forEach(function (c, i) {
          if (!c.rect || !c.anton || !ACENTO.test(c.fuente)) return;
          var g = geometria(c);
          var tope = g.base - g.m.tintaArriba * g.s;
          var pisa = visibles.some(function (o) {
            if (o === c) return false;
            var go = geometria(o);
            // Arriba = en otra línea, más alta que la del acento.
            if (go.base >= g.base - 0.5 * c.rect.height) return false;
            var solape = Math.min(c.rect.right, o.rect.right) - Math.max(c.rect.left, o.rect.left);
            if (solape <= 1) return false;
            var fondo = go.base + go.m.tintaAbajo * go.s;
            return tope < fondo - 1;
          });
          if (!pisa) return;
          var p = palabra(lista, i).toLocaleUpperCase("es");
          if (vistas[p]) return;
          vistas[p] = true;
          hallazgos.push({ tipo: "tilde", escena: escena, motivo: "visual: tilde de «" + p + "» pisa la línea anterior en " + contexto(escena) });
        });
      }

      if (comprobar.indexOf("puntuacion") >= 0) {
        lista.forEach(function (c, i) {
          if (!c.rect || !CIERRE.test(c.ch)) return;
          var j = i - 1;
          // Carácter visible no blanco anterior (se saltan blancos y ocultos).
          while (j >= 0 && !lista[j].rect) j--;
          if (j < 0) return;
          var a = lista[j];
          if (!mismaLinea(c, a)) return;
          var tam = parseFloat(c.estilo.fontSize);
          // Range incluye los márgenes laterales del glifo: texto corrido da 0 px; 0,06 em ya se ve.
          if (c.rect.left - a.rect.right > 0.06 * tam) {
            hallazgos.push({ tipo: "puntuacion", escena: escena, motivo: "visual: espacio antes de «" + c.ch + "» tras «" + palabra(lista, j) + "» en " + contexto(escena) });
          }
        });
      }
    });

    // --- Textos: cada elemento con texto propio ---
    var textos = [];
    var elementos = []; // elemento de cada texto (mismo índice)
    document.querySelectorAll("body *").forEach(function (el) {
      if (el.closest("script,style")) return;
      var propio = Array.prototype.some.call(el.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); });
      if (!propio) return;
      var escena = escenaDe(el, hayEscenas);
      if (escena < 0) return;
      var r = el.getBoundingClientRect();
      var pasoEl = el.closest("[data-paso]");
      var paso = pasoEl ? pasoEl.getAttribute("data-paso") : undefined;
      var t = {
        escena: escena,
        texto: pintado((el.textContent || "").trim().replace(/\s+/g, " "), getComputedStyle(el)),
        opacidad: opacidadEfectiva(el),
        rect: { x: r.left, y: r.top, w: r.width, h: r.height },
        marca: !!el.closest("[data-brand]"),
      };
      if (paso === "numero" || paso === "heading") t.paso = paso;
      textos.push(t);
      elementos.push(el);
    });

    if (comprobar.indexOf("zona") >= 0 && opts.zona) {
      var limiteAbajo = altura - opts.zona.abajo;
      var bloques = [];
      textos.forEach(function (t, i) {
        if (t.marca || t.opacidad < 0.3 || t.rect.w <= 0 || t.rect.h <= 0) return;
        if (t.rect.y >= opts.zona.arriba - 1 && t.rect.y + t.rect.h <= limiteAbajo + 1) return;
        // Un motivo por bloque animado: tras SplitText cada palabra es su propio texto.
        var el = elementos[i];
        var bloque = el.closest('[data-anim]:not([data-anim="pop"])') || el;
        if (bloques.indexOf(bloque) >= 0) return;
        bloques.push(bloque);
        var texto = pintado((bloque.textContent || "").trim().replace(/\s+/g, " "), getComputedStyle(bloque));
        var corto = texto.length > 40 ? texto.slice(0, 40) + "…" : texto;
        hallazgos.push({ tipo: "zona", escena: t.escena, motivo: "visual: texto «" + corto + "» sale de la zona segura en " + contexto(t.escena) });
      });
    }

    return { textos: textos, hallazgos: hallazgos };
  };

  /*
   * Serie del reel: para cada paso { t, comprobar } hace window.__reel.seek(t)
   * y __revisarVisual con las opciones comunes. Una sola ida y vuelta desde
   * Playwright. Devuelve [{ t, textos, hallazgos }]; los textos ocultos
   * (opacidad 0) no viajan.
   */
  window.__revisarSerie = function (pasos, opts) {
    return pasos.map(function (p) {
      window.__reel.seek(p.t);
      var r = window.__revisarVisual(Object.assign({}, opts, { comprobar: p.comprobar }));
      return { t: p.t, textos: r.textos.filter(function (x) { return x.opacidad > 0; }), hallazgos: r.hallazgos };
    });
  };
})();
