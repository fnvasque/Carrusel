# Task 2 — Cliente de insights (solo lectura)

Worktree: `/Users/felipevasquez/Documents/Claude/Carrusel/.claude/worktrees/agent-ac885f718ba308dd8` (rama `worktree-agent-ac885f718ba308dd8`, ff desde ab8002f). Commit c7b5dca. (Este reporte no está commiteado; el agente no podía escribir en el otro worktree.)

## Qué hice
- `src/insights/client.ts`: `parseInsights`, `unsupportedMetric`, `fetchOwnMedia`, `fetchMediaInsights`, `fetchAccountInsights`, `POST_METRICS`, `REEL_METRICS` y tipos del brief.
- `test/insights/client.ts` (24 casos), `test/insights.ts` (`await done()`), `test/_check.ts` (`checkAsync` registra promesas; `done()` las espera).

## RED / GREEN
- RED: `npx tsx test/insights.ts` → `ERR_MODULE_NOT_FOUND src/insights/client.ts`.
- Parcial: `21 ok, 3 fallos` (dos fallos eran bugs del código del brief).
- GREEN: `npx tsx test/insights.ts` → `24 ok, 0 fallos`; `npm run typecheck` limpio; `npm test` → `87 ok, 0 fallos`.

## Desviaciones del código del brief
1. `unsupportedMetric`: `metric[3] must be one of … reach, saved` nombra métricas válidas y la búsqueda por nombre devolvía `reach`; ahora `metric[N]` tiene prioridad. Códigos 4, 10, 17, 32, 190, 200, 613 nunca cuentan como métrica inválida.
2. `fetchMediaInsights`: `for (i <= metrics.length)` con `metrics` encogiendo terminaba antes y devolvía `{descartadas}` vacío en silencio. Ahora `for (;;)`: cada fallo quita una métrica, con una sola se relanza (máx. métricas + 1 llamadas).

## Decisiones adversariales
- `parseInsights`: solo números finitos; duplicada → la primera.
- `fetchOwnMedia`: filtra por ítem, dedupe por id; corta por `since`, página vacía, sin `next`, cursor repetido, 20 páginas. Error en página 2 se propaga.
- `fetchAccountInsights`: 5 llamadas independientes con `try`; `errores` de online_followers menciona "100 seguidores".
- Sin red; ningún token impreso.

## Archivos
`src/insights/client.ts`, `test/insights/client.ts`, `test/insights.ts`, `test/_check.ts` (los dos últimos también los crea Task 1). `package.json` sin tocar.

## Dudas
- `fetchOwnMedia` propaga errores de página ≥ 2 en vez de devolver lista parcial.
- `onlineFollowers` toma el último elemento de `values`.

## Fix ronda 1
Cambios en `src/insights/client.ts`: nuevo `invalidMetrics` (devuelve varias); `unsupportedMetric` = su primer elemento. Orden: `metric[N]` > lista "must be one of / debe ser uno de" (descarta de una vez lo pedido que no está; ignorada si no contiene ninguna pedida) > frase de "no soportada" (métrica más cercana ANTES de la palabra clave, si no hay, la primera después). Palabras clave en español agregadas. Códigos 4/10/17/32/190/200/613 nunca cuentan. `fetchMediaInsights` descarta todas las malas en un paso y relanza si no queda ninguna (tope métricas + 1). `igUserId` ya era lazy (default param); test nuevo sin env META_*.
Comando: `npm run typecheck && npx tsx test/insights.ts && npx tsx test/adversarial/index.ts` → typecheck limpio; `30 ok, 0 fallos`; adversario `3 ok, 0 fallos` (sin modificarlo).
