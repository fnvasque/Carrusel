# Base de conocimiento personal

Vault de Obsidian versionado en git. Lo escriben dos sistemas y el usuario.

## Estructura

- `fuentes/` — una ficha por post de Instagram guardado o video de YouTube enviado al bot (`tipo: video`), con resumen, ideas clave, herramientas y transcripción. La escribe el bot.
- `temas/` — una página por tema. Zona `kb:auto` = síntesis del bot; bloque `kb:research` = investigación semanal.
- `referencias/` — una nota por cosa concreta investigada (software, producto, libro, método, persona, lugar, concepto), con fuentes `[n]`, fecha `revisado`, `etapa` (perder-el-miedo, adoptar, liderar o revalorizarse: el camino del coaching de la cuenta) y `## Para la audiencia` (qué puede hacer con eso alguien de cargo medio que está aprendiendo a usar la IA, empezando por un «Dicho simple»; de ahí salen las piezas de Instagram y las sesiones). Las notas `tipo: conexion` juntan 3 o más referencias para sostener una idea que ninguna dice sola.
- `_investigacion/` — manual del agente (`INSTRUCCIONES.md`), validador, registro de corridas y resúmenes; `alcance.json` (qué temas sirven a la cuenta y las etapas del coaching), `pedidos.md` (temas que el usuario pide investigar), `preguntas.md` (lo que preguntan en las sesiones) y `lector-aprendiz.md` (el evaluador de las notas), todos del usuario. `node _investigacion/validar.mjs --cobertura` dice qué etapa está corta.
- `_adjuntos/` — imágenes de las fichas.
- `_calendario/` — calendario de Instagram: manual del planificador (`INSTRUCCIONES.md`), `config.json`, validador y una carpeta por semana (`plan.json` y borradores del agente, `render.json` del Mac, `estado.json` del bot); `registro.jsonl` (bot), `experimentos.md`, `aprendizajes.md` y `candidatos.json` (agente: temas que la investigación debe cubrir para la semana siguiente); `momentos.md` (usuario: momentos × capacidades de las piezas), `hoja-de-ruta.md` (usuario: etapa y guía de cada semana) y `<semana>/correcciones.md` (usuario: lo que corrigió a mano y por qué).
- `_metricas/` — métricas de Instagram (instantáneas, cuenta, resúmenes semanales, `bucle.json`). Solo las escribe el bot.

## Cómo usarla al desarrollar

- Para saber qué se sabe de una herramienta: `referencias/<slug>.md` (API, precio, cómo se implementa, alternativas).
- Para el panorama de un área: `temas/<Tema>.md` (zona `kb:auto` + bloque `kb:research`).
- Para el detalle original: las fichas de `fuentes/` enlazadas desde el tema.
- Respeta la fecha `revisado`: si es antigua, verifica antes de depender de un dato.

## Reglas

- `## Mis notas` es del usuario: nunca se borra ni se reescribe.
- El bot solo escribe en `fuentes/`, `_adjuntos/` y la zona `kb:auto`; el agente de investigación sigue `_investigacion/INSTRUCCIONES.md`.
- El planificador sigue `_calendario/INSTRUCCIONES.md`: solo escribe `_calendario/<semana>/plan.json`, sus borradores, `correcciones.md` (vacía: la llena el usuario cuando corrige una pieza), `experimentos.md`, `aprendizajes.md` y `candidatos.json`.
- `_investigacion/alcance.json`, `pedidos.md`, `preguntas.md` y `lector-aprendiz.md` son del usuario: los agentes los leen, nunca los escriben.
- `_calendario/config.json`, `momentos.md`, `hoja-de-ruta.md`, `lector-frio.md`, `guia-hooks.md`, `guia-redaccion.md`, `validar.mjs`, `reglas.json` e `INSTRUCCIONES.md` son del usuario (`scripts/kb-calendario-install.sh`); el agente propone cambios en `aprendizajes.md`, no los aplica.
