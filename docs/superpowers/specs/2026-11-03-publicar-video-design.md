# /publicar — publicar un video listo desde cualquier proyecto

Fecha: 2026-11-03 · Estado: aprobado en chat por Felipe.

## Intención

Felipe termina videos en otros proyectos y quiere que salgan en @ia.punto.es sin pasar por el
planificador. Llega con **un video listo y sin caption**. Hoy eso exige el camino a mano
(manifiesto en `Carrusel-render`, pieza `hechaAMano` en `plan.json`, push a la base,
`calendario:render`), que son varios pasos frágiles. `/publicar` los hace solo.

## Qué hace

`/publicar <ruta-del-video>`, skill global (vive en `skills/publicar/` y se enlaza en
`~/.claude/skills/`, igual que `/caso`):

1. **Revisa el video** con ffprobe: si es vertical, duración y códec. Horizontal o fuera de los
   límites de Instagram → avisa antes de seguir.
2. **Pregunta cuándo publicarlo:**
   - «Ahora» → el próximo hueco de hora válida (HH:00 o HH:30) con al menos 15 min de margen,
     para que suba, el bot lea la base y Meta procese el video.
   - Día y hora → pieza extra ese día. Nunca reemplaza una pieza planificada; avisa si queda a
     menos de 2 h de otra.
   - Solo semanas que ya tienen `plan.json` (así el planificador del domingo no lo pisa).
3. **Escribe el caption** con cuadros clave, texto en pantalla y transcripción del audio si hay.
   Reglas de la cuenta: para aprendices (una idea, una acción), firma @ia.punto.es con
   «Te ayudo a partir…», nunca el nombre de Felipe, y los `hashtagsBase` de `config.json`.
4. **Saca `cover.jpg` y `story.jpg`** del video.
5. **Muestra** caption, portada, story, día y hora, y espera el OK o correcciones.
6. **Programa** por el camino a mano y confirma con render.json en `renderizado` (URL pública verificada por el render).

## Decisiones de Claude (aprobadas con el diseño)

- Nunca reemplaza piezas; aviso a < 2 h de otra.
- Solo semanas con `plan.json`.
- Parte mecánica en este repo (`npm run publicar`, con test en `npm test`); el skill hace el
  caption, la conversación y la aprobación, y llama al comando.
- El comando escribe en `Carrusel-render` (que corre desde `main`), así que sirve solo después
  del merge.
- `story.jpg` = el mismo cuadro de la portada (el video ya es 9:16).

## Fuera de alcance

Carruseles (después), editar el video, juez y lector frío del planificador.

## Antiobjetivos

- Que pise o reemplace una pieza del planificador.
- Que publique sin que Felipe vea el caption y la portada.
- Que el render del Mac intente re-renderizar la pieza y la marque fallida.
