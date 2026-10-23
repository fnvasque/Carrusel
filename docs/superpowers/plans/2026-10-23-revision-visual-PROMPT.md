Implementa la **revisión visual de lo renderizado en el Mac**, fases 1 y 2, en este worktree.

## Antes de empezar

- **El diseño ya está aprobado:** `docs/superpowers/specs/2026-10-23-revision-visual-design.md`.
  Léelo entero. Manda sobre todo lo demás, junto con `AGENTS.md`.
- **Rama:** parte de `claude/revision-visual`, que trae el diseño, o de una rama nueva creada desde
  ella. Trabaja en ramas `claude/…` y abre PR. Nunca hagas push a `main`.
- **Planes:** usa el skill `superpowers:writing-plans` para escribir **dos planes**, porque son dos
  PRs:
  - `docs/superpowers/plans/2026-10-23-revision-visual-fase1.md`: arreglos del motor (tildes,
    puntuación después de SplitText, encime en transiciones, número solo, zona segura superior),
    comprobaciones exactas en el render, fallo visual reintentable con un aviso por pieza, script
    de corpus que re-renderiza 3 semanas sin subir nada, y entrada en `reglas.json`.
  - `docs/superpowers/plans/2026-10-23-revision-visual-fase2.md`: revisor con visión de OpenAI que
    corre en el Mac en modo aviso, con topes; `sendPhoto` con botones inline; el callback
    `cal-visual` en el bot del servidor (`src/calendario/telegram.ts`); los archivos
    `visual.json` y `visual-respuestas.jsonl`; la precisión en el bucle; y entrada en
    `reglas.json`.
- **Ejecución:** ejecuta los planes en orden con `superpowers:subagent-driven-development`.
  Termina y mergea la fase 1 antes de empezar la fase 2.

## Datos ya averiguados (no los busques de nuevo)

- **Titular Anton** (`src/theme.ts`, `src/templates/fit.ts` `fitDisplaySize`). El `line-height` va
  fijo en cada plantilla:
  - 0,98 en Hook, Cta y Clip;
  - 1,0 en Step, Screen y Prompt;
  - 0,86 en el valor de Stat;
  - 1,08 en MythReality.
- **`highlight`:** `src/templates/highlight.tsx` envuelve la puntuación pegada en un span aparte.
  En el reel, `SplitText` (`src/reel/runtime.js` ~l.256) probablemente mete el espacio de
  «SEEDANCE ,». El único test (`test/smoke.ts` ~l.753) revisa el markup estático.
- **Transiciones:** cada escena sale y entra con `autoAlpha` y `yPercent`, y se solapan durante
  `T.transition` (`src/reel/timing.ts`; 0,3 a 0,5 s). La timeline expone `window.__reel.seek`. La
  captura está en `src/reel/capture.ts`, y `captureStills` da el estado final de cada escena.
- **«3» solo:** el stagger del código (`OVERLAP` 0,6) no explica unos 2 s. Revisa el `autoAlpha`
  del heading, el fallback de `SplitText` (`data-reel-split-fallback`) o un seek mal capturado.
  Reprodúcelo con `sab-reel-narra-sin-tu-voz`.
- **QA y render:**
  - `src/calendario/qa.ts` revisa negro, decodificación, audio y lectura.
  - `src/calendario/render.ts`: `ErrorContenido` deja la pieza en `fallido` terminal y sin aviso;
    un error de entorno avisa por `avisarTelegram` y se reintenta.
  - El render corre cada hora por launchd.
- **Tests de layout:** `test/layout-bounds.ts` mide límites del DOM sin pasar por el runtime.
  `npm run test:reel` corre los tests de medios (Chromium y ffmpeg; no correr
  `playwright install`).
- **Zonas seguras:** en `src/templates/layout.ts`, `REEL_SAFE_TOP` 150 y `REEL_SAFE_BOTTOM` 440. La
  franja de `qa.ts` (~l.166) está escrita a mano.
- **Fondos:** `src/render/background.ts`. Un `{ai}` sin resolver cae al fondo liso (`Frame.tsx`).
- **Bot:** ya tiene botones inline (`callbackSaltar`, `telegram.ts` ~l.258). Corre en Docker en
  el servidor (`deploy/README.md`). El Mac solo puede usar `sendMessage`/`sendPhoto` directo
  (`telegram-directo.ts`).
- **Clave en el Mac:** solo `OPENAI_API_KEY` (`~/Documents/Claude/Carrusel-render/.env`).
- **Casos reales para los tests:** los renders publicados están en
  `~/Documents/Claude/Carrusel-render/output/calendario/<semana>/<id>/`.
  - Tilde que choca: `2026-10-12/sab-reel-narra-sin-tu-voz`, Cta («PARA» se lee «PABA»).
  - Coma con espacio: `2026-10-19/vie-pm-reel-kling-vs-seedance` («SEEDANCE ,»).
  - Textos encimados: el mismo reel de Kling, en la transición a «$400 vs $1.100».
  - Fondo que compite: `2026-10-19/mar-carrusel-6-preguntas-para-delegar-en-ia`, slide 1.

  Los borradores están en `knowledge/_calendario/<semana>/<id>.json` (solo lectura).

## Reglas duras

- No edites ni borres tests para que pasen. Si uno fija algo que el diseño cambia, dilo en la PR.
- `knowledge/` es de solo lectura: el script del corpus renderiza a una carpeta temporal y no sube
  nada.
- No borres `.cache/` ni los clips. No gastes en APIs fuera de los topes del diseño.
- La puerta de cada PR es `npm run typecheck && npm test && npm run test:reel` en 0, más el corpus
  sin violaciones en la fase 1.
- Antes del merge de la fase 1, pide `/codex:adversarial-review`, porque decide qué se publica.
- No despliegues el bot del servidor ni toques `Carrusel-render` sin mi visto bueno. Al final de
  cada fase, dime qué hay que actualizar en el Mac y en el servidor, y cómo.

## Al terminar cada fase

Dame en 5 líneas qué cambió, qué quedó verificado y qué quedó pendiente, con el enlace a la PR.
