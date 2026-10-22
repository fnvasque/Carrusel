# AGENTS.md — Carrusel

Instrucciones para agentes de código (Claude Code, Codex). Corto a propósito: la arquitectura
está en `README.md`; léela solo si la tarea la necesita.

## Idioma
- Responde, comenta y escribe commits en español. Identificadores de código como estén.

## Comandos
- `npm run typecheck` — tipos (≈2 s).
- `npm test` — tests offline, sin red ni binarios externos (≈15 s). Junto con typecheck es la
  puerta de calidad: una tarea no está terminada hasta que ambos salen 0.
- `npm run test:reel` — solo si tocaste render, reels o medios (usa Chromium y ffmpeg, lento).
- `npm run meta:check` — solo si tocaste la publicación en Meta/Instagram.

## Rarezas del entorno
- El render usa Playwright con el Chromium que ya trae; **no** ejecutes `playwright install`.
- Los reels necesitan `ffmpeg` en el PATH.
- Cachés en `.cache/` (`ai/`, `voz/`, `kb/`) y clips de video en la caché del Mac: no los borres
  para "limpiar"; regenerarlos cuesta dinero en APIs.
- `knowledge/` es otro repo (la base de Obsidian `ia-es-kb`): no lo modifiques desde aquí, y nunca
  en las zonas `kb:auto` ni `kb:research`.
- `render.json` lo escribe solo el Mac; no lo edites salvo que te lo pidan.

## Restricciones duras
- Nunca hagas push a `main` ni `--force`. Trabaja en ramas `claude/<tema>` y abre PR.
- No edites ni borres tests para que pasen. Si un test está mal, dilo y explica por qué.
- No subas `.env`, claves ni tokens. No pongas secretos en logs ni en commits.
- Piezas borradas de Instagram: respeta la lista `BORRADAS` de
  `~/.claude/scheduled-tasks/actualizar-dashboard-metricas/generar.py`; no las vuelvas a avisar.

## Forma de trabajar
- Antes de implementar, define "terminado" como un comando verificable (normalmente
  `npm run typecheck && npm test`, más un test nuevo que cubra el cambio).
- Cambios grandes: plan en `docs/superpowers/plans/`, spec en `docs/superpowers/specs/`.
- Cambios de riesgo (publicación, borrado de medios, dinero en APIs): pide una revisión
  independiente (`/codex:adversarial-review` en Claude Code) antes del merge.
- Los hooks de `.claude/settings.json` corren typecheck al editar, bloquean comandos peligrosos y
  no dejan cerrar la tarea con typecheck o tests en rojo.
