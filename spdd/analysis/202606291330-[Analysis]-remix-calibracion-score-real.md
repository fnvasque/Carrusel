# SPDD Analysis: Score — cerrar el bucle predicho↔real (Tanda 2 · Iteración 3/3)

## Original Business Requirement

> Calibración del score con métricas reales: cerrar el bucle predicho↔real con record/calibrate. Hoy `record` guarda métricas reales y `calibrate` SOLO reporta tabla + correlación (Pearson), pero no realimenta nada: el bucle está abierto. Quiero cerrarlo aprendiendo un mapeo del score predicho a las tasas reales (saves/1k, shares/1k) y mostrándolo como proyección en cada score (score/cli y remix), de forma robusta con pocos datos. Mantener typecheck y `npm run test` verdes; no romper record/calibrate/generate/reel/remix.

## Domain Concept Identification

### Existing Concepts (from codebase)

- **scoreCarousel / ViralityResult / THRESHOLD** (`src/score/virality.ts`): heurística de viralidad (0-100). Se mantiene como predicción base; NO se auto-ajustan sus pesos (riesgo de overfit con pocos datos).
- **record (`src/score/record.ts`)**: persiste `metrics/<name>.json` con `predictedScore`, `savesPerK`, `sharesPerK`, etc. Es la fuente de verdad del "real".
- **calibrate (`src/score/calibrate.ts`)**: lee los `metrics/*.json`, imprime tabla predicho↔real y `pearson()`; **no escribe un modelo ni realimenta**. Aquí está el bucle abierto.
- **printReport (`src/score/cli.ts`)**: render del reporte de score; lo usan `score`, `generate` (vía `renderCarousel`) y `remix`. Punto único para mostrar la proyección.
- **pearson()** (`calibrate.ts`): correlación; reutilizable, conviene compartirla con el nuevo módulo.
- **metrics/** (dir existente, vacío): destino de datos; `calibration.json` vivirá aquí.
- **Smoke tests** (`test/smoke.ts`): el gate de tests; la nueva matemática (regresión/proyección) es pura → testeable offline.

### New Concepts Required

- **CalibrationModel** (nuevo, `src/score/calibration.ts`): mapeo aprendido predicho→real = `{ n, rSaves, rShares, saves:{slope,intercept}, shares:{slope,intercept}, updatedAt }`.
- **linearFit(xs, ys)** (nuevo): regresión lineal por mínimos cuadrados (pendiente/intercepto); base del mapeo.
- **buildCalibration(metrics) / refreshCalibration()** (nuevo): construye el modelo desde los `metrics/*.json` y lo persiste en `metrics/calibration.json`.
- **loadCalibration() / projectOutcome(model, score)** (nuevo): carga el modelo y proyecta saves/1k y shares/1k esperados para un score dado (clamp ≥0).
- **Proyección en el reporte**: `printReport` muestra "según tus datos, este score ≈ X saves/1k · Y shares/1k (r=…, n=…)" cuando hay modelo con suficientes datos.

### Key Business Rules

- **Cerrar el bucle = realimentar, no solo reportar**: las métricas reales producen un modelo persistido que se proyecta sobre cada score nuevo.
- **Robustez con pocos datos**: proyección solo si `n ≥ 3`; etiquetar baja confianza si `n < 5` o `|r|` bajo. Nunca afirmar certezas con 1-2 puntos.
- **No auto-tunear la heurística**: `scoreCarousel` y sus pesos no se modifican automáticamente (overfit). La calibración es una capa de proyección, no un re-entrenamiento de los pesos.
- **Determinismo y offline**: la matemática (fit/projection/pearson) es pura y va a smoke tests; nada de red.
- **Compatibilidad**: `record`/`calibrate`/`generate`/`reel`/`remix` siguen funcionando; cambios aditivos.

## Strategic Approach

### Solution Direction

Capa de calibración persistida + proyección en el reporte:

```
record (guarda metrics/<name>.json) ──┐
                                       ├─▶ refreshCalibration() ──▶ metrics/calibration.json (modelo)
calibrate (tabla + correlación) ──────┘                                   │
                                                                          ▼
scoreCarousel(spec) → ViralityResult ──▶ printReport ──▶ proyección: ~X saves/1k · ~Y shares/1k (r, n)
```

- **`src/score/calibration.ts`**:
  - `pearson(xs, ys)` (movida aquí; `calibrate.ts` la importa) + `linearFit(xs, ys): {slope,intercept}|null` (≥2 puntos, denominador≠0).
  - `buildCalibration(metrics): CalibrationModel|null` (≥3 puntos): ajusta `predicted→savesPerK` y `predicted→sharesPerK`, calcula `rSaves`/`rShares`.
  - `refreshCalibration(): Promise<CalibrationModel|null>`: lee `metrics/*.json` (excluye `calibration.json`), construye y escribe `metrics/calibration.json`.
  - `loadCalibration(): CalibrationModel|null` (sync, para `printReport`): lee el JSON si existe.
  - `projectOutcome(model, score): {savesPerK, sharesPerK}|null` (clamp ≥0).
- **`record.ts`**: tras escribir el `metrics/<name>.json`, llamar `refreshCalibration()` (cierra el bucle automáticamente) e informar.
- **`calibrate.ts`**: reutiliza `pearson`/`buildCalibration`; persiste el modelo (`refreshCalibration`) y muestra la proyección para algunos scores de referencia (p. ej. THRESHOLD, 90).
- **`printReport` (`score/cli.ts`)**: si `loadCalibration()` da modelo con `n≥3`, añadir línea de proyección para `r.total`, con nota de confianza.
- **smoke tests**: `linearFit` (puntos en una recta → slope/intercept exactos), `projectOutcome` (clamp), `pearson` (n<3 → null; correlación perfecta → 1).

### Key Design Decisions

- **Proyección por regresión lineal predicho→real** (vs. re-tunear pesos del score): → cierra el bucle de forma interpretable y robusta sin overfittear la heurística con pocos datos; el usuario ve el score traducido a saves/1k reales. Recomendado. Trade-off: no "mejora" el score en sí, pero lo hace accionable y deja la puerta a tuning manual (ya sugerido por `calibrate`).
- **Persistir `metrics/calibration.json`** (vs. recalcular en cada `printReport`): → `printReport` es sync y se llama en cada render; leer un JSON pequeño es barato y evita reescanear el dir. Recomendado. Refresco en `record`/`calibrate`.
- **Umbral `n≥3` + etiqueta de confianza** (vs. proyectar siempre): → evita afirmaciones con 1-2 datos. Recomendado.
- **Mover `pearson` a `calibration.ts`** y que `calibrate.ts` la importe: → una sola implementación. Recomendado (refactor menor, behavior-preserving).
- **No tocar `scoreCarousel`**: → preserva el gate y los tests existentes; la calibración es capa aparte. Recomendado.

### Alternatives Considered

- **Auto-ajuste de los 6 pesos de `virality.ts` por regresión multivariable**: descartado — con <10 carruseles overfittea y desestabiliza el gate; mejor proyección lineal + tuning manual informado.
- **Mostrar la proyección solo en `calibrate`**: insuficiente — el valor está en verla al crear/puntuar cada carrusel (score/cli y remix), que es donde se decide publicar.
- **Recalcular el modelo en cada `printReport` (escanear dir)**: descartado — IO repetido en bucles de render; mejor un JSON cacheado.

## Risk & Gap Analysis

### Requirement Ambiguities

- **Cuántos datos mínimos**: `n≥3` para proyectar; `n<5` → etiqueta "preliminar". Registrar.
- **Qué proyectar**: saves/1k y shares/1k (las tasas que ya guarda `record`). Registrar.
- **Dónde se muestra**: en `printReport` (cubre score/generate/remix) + ejemplos en `calibrate`. Registrar.
- **¿Se commitea `calibration.json`?**: es dato derivado del usuario; se genera en runtime (como los `metrics/<name>.json`). No se commitea data real en esta iteración. Registrar.

### Edge Cases

- **0-2 métricas**: sin modelo; `printReport` no muestra proyección; `calibrate` informa "necesitas ≥3".
- **Todos los predicted iguales** (denominador 0 en fit/pearson): `linearFit`/`pearson` devuelven null → sin proyección.
- **Proyección negativa**: clamp a 0.
- **`calibration.json` corrupto/viejo**: `loadCalibration` captura y devuelve null (sin romper el reporte).
- **`metrics/` inexistente**: `refreshCalibration` lo crea/maneja; `loadCalibration` → null.
- **`printReport` sync vs IO**: usar lectura sync acotada (`readFileSync`) solo del JSON pequeño; tolerar ausencia.

### Technical Risks

- **Sobreinterpretar correlaciones con n bajo**: mitigación: umbral n≥3, etiqueta de confianza, y el aviso existente si r<0.3.
- **Romper `printReport` (lo usan 3 flujos)**: mitigación: cambio aditivo y defensivo (try/catch, null-safe); smoke test no cubre printReport (IO/console) pero sí la matemática.
- **Duplicar pearson / drift**: mitigación: una sola fuente en `calibration.ts`.
- **Acoplar `score/cli.ts` a IO de archivos**: aceptable (ya hace dynamic import); la lectura es opcional y tolerante.

### Acceptance Criteria Coverage

| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | Aprender mapeo predicho→real (saves/1k, shares/1k) | Yes | `linearFit` + `buildCalibration` |
| 2 | Persistir el modelo y refrescarlo al registrar | Yes | `metrics/calibration.json` + `refreshCalibration` en record/calibrate |
| 3 | Mostrar proyección en cada score (score/generate/remix) | Yes | `printReport` + `loadCalibration`/`projectOutcome` |
| 4 | Robusto con pocos datos (n≥3, confianza) | Yes | umbral + etiqueta |
| 5 | No auto-tunear la heurística | Yes | scoreCarousel intacto |
| 6 | typecheck + npm run test verdes; nada se rompe | Yes | tests de la matemática; cambios aditivos |

## Decisiones tomadas autónomamente

1. **Cerrar el bucle vía proyección** (regresión lineal predicho→saves/1k y →shares/1k), NO auto-tuneando los pesos de `scoreCarousel`.
2. **Nuevo `src/score/calibration.ts`** con `pearson`, `linearFit`, `buildCalibration`, `refreshCalibration`, `loadCalibration`, `projectOutcome` y el tipo `CalibrationModel`.
3. **Persistir `metrics/calibration.json`**; refrescarlo en `record` (tras registrar) y en `calibrate`.
4. **Proyección en `printReport`** cuando `n≥3`, con etiqueta de confianza (preliminar si `n<5` o `|r|` bajo).
5. **Mover `pearson` a `calibration.ts`** y que `calibrate.ts` la importe (sin duplicar).
6. **Smoke tests** para `linearFit`/`projectOutcome`/`pearson` (puros, offline).
7. **Lectura sync tolerante** en `printReport` (`loadCalibration` con try/catch → null).
