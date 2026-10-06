# Base de conocimiento personal

Vault de Obsidian versionado en git. Lo escriben dos sistemas y el usuario.

## Estructura

- `fuentes/` — una ficha por post de Instagram guardado (resumen, ideas clave, herramientas, transcripción). La escribe el bot.
- `temas/` — una página por tema. Zona `kb:auto` = síntesis del bot; bloque `kb:research` = investigación semanal.
- `referencias/` — una nota por cosa concreta investigada (software, producto, libro, método, persona, lugar, concepto), con fuentes `[n]` y fecha `revisado`.
- `_investigacion/` — manual del agente (`INSTRUCCIONES.md`), validador, registro de corridas y resúmenes.
- `_adjuntos/` — imágenes de las fichas.
- `_calendario/` — calendario de Instagram: manual del planificador (`INSTRUCCIONES.md`), `config.json`, validador y una carpeta por semana (`plan.json` y borradores del agente, `render.json` del Mac, `estado.json` del bot); `registro.jsonl` (bot), `experimentos.md` y `aprendizajes.md` (agente).
- `_metricas/` — métricas de Instagram (instantáneas, cuenta, resúmenes semanales, `bucle.json`). Solo las escribe el bot.

## Cómo usarla al desarrollar

- Para saber qué se sabe de una herramienta: `referencias/<slug>.md` (API, precio, cómo se implementa, alternativas).
- Para el panorama de un área: `temas/<Tema>.md` (zona `kb:auto` + bloque `kb:research`).
- Para el detalle original: las fichas de `fuentes/` enlazadas desde el tema.
- Respeta la fecha `revisado`: si es antigua, verifica antes de depender de un dato.

## Reglas

- `## Mis notas` es del usuario: nunca se borra ni se reescribe.
- El bot solo escribe en `fuentes/`, `_adjuntos/` y la zona `kb:auto`; el agente de investigación sigue `_investigacion/INSTRUCCIONES.md`.
- El planificador sigue `_calendario/INSTRUCCIONES.md`: solo escribe `_calendario/<semana>/plan.json`, sus borradores, `experimentos.md` y `aprendizajes.md`.
- `_calendario/config.json`, `lector-frio.md`, `validar.mjs` e `INSTRUCCIONES.md` son del usuario (`scripts/kb-calendario-install.sh`); el agente propone cambios en `aprendizajes.md`, no los aplica.
