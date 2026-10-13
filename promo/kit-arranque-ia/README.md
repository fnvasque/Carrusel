# Kit de arranque con IA (recurso gratis del enlace de la bio)

PDF de 12 páginas (1080×1620, pensado para leer en el celular) que cumple la promesa de
la bio de @ia.punto.es ("Guía gratis"). Cada día resuelve una tarea real con una
herramienta gratis, el prompt copiable, qué esperar y la trampa que evitar. La sustancia
sale de `referencias/` de la base (sección "Para la audiencia"), no de inventos.

- `kit.html`: contenido y estilo (sistema visual lima; fuentes de `src/fonts/`).
- `render.mjs`: HTML → `salida/kit-arranque-con-ia.pdf` + `portada.png` + `dia-1.png`.
- `cover-horizontal.html`: portada 1920×1080 para Gumroad (exige horizontal); `salida/miniatura.png` es el recorte cuadrado.
- `salida/`: lo que se sube a Gumroad. Publicado el 2026-10-13: <https://saifnvasque.gumroad.com/l/kit-arranque-ia> ($0+).

```bash
CHROMIUM_PATH=~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell \
node promo/kit-arranque-ia/render.mjs promo/kit-arranque-ia/salida
```

Sin `CHROMIUM_PATH` usa el Chromium que Playwright tenga instalado.

## Publicar

1. Gumroad → producto digital a **$0+** (pide correo al descargar y queda la lista). Hecho:
   portada horizontal, miniatura cuadrada y el PDF en Content.
2. En la app de Instagram (solo móvil): editar perfil → enlaces → reemplazar el enlace del
   producto CÉLULAS por el del kit. CÉLULAS puede quedar como segundo enlace.
3. Nueva edición: editar `kit.html`, renderizar, reemplazar el archivo en Gumroad (mismo
   enlace).

## Referencias usadas

prompt-con-contexto-ejemplos-e-iteracion, chatgpt-para-finanzas-personales, regla-50-30-20,
matriz-de-eisenhower, modo-estudio-de-chatgpt, aprendizaje-guiado-de-gemini,
modo-aprendizaje-de-claude, tutoria-socratica-con-ia, notebooklm,
tareas-programadas-de-chatgpt, zapier, intelligent-ui-de-chatgpt,
postergacion-de-la-preocupacion, etiquetado-afectivo, riesgos-de-la-ia-en-finanzas-personales,
canva, edits, kokoro, speaker-coach. Fecha de revisión de la mayoría: 2026-10-09 a 2026-10-11.
