---
name: publicar
description: Use when Felipe escribe «/publicar <video>», «publica este video», «programa este reel» o entrega un video vertical ya listo para subirlo a @ia.punto.es (revisa el video, pregunta cuándo, escribe el caption, muestra todo, espera el OK y lo programa).
---

# /publicar — publicar un video ya listo en @ia.punto.es

Toma un video terminado (en cualquier proyecto), lo revisa, escribe el caption, te lo muestra y,
**solo con tu OK explícito**, lo programa como una pieza extra del calendario. Nunca reemplaza una
pieza del planificador.

## Cómo se llama el comando (siempre así)

```
npm --prefix ~/Documents/Claude/Carrusel-render run -s publicar -- <sub> "<video>" …
```

**Siempre en `Carrusel-render`, nunca en `Carrusel`.** Por qué: el render horario del Mac busca la
carpeta final con su manifiesto en el `output/` de `Carrusel-render`; si el comando corre desde otro
lugar, el render no la encuentra, intenta re-renderizar la pieza y la marca fallida. Eso también
significa que `publicar` solo existe ahí después de que la rama se mergee a `main`.

Subcomandos (todos imprimen JSON en stdout; los errores salen por stderr con `✗ …` y código 1):

| Subcomando | Qué hace |
|---|---|
| `revisar "<video>" [--transcribir]` | Inspecciona el video y saca cuadros. No escribe en la base. |
| `programar "<video>" --cuando "<ahora\|AAAA-MM-DD HH:MM>" --hook "<texto>" --caption-file "<ruta>" [--id <id>] [--dry-run]` | Con `--dry-run` valida y no escribe nada; sin él, deja la pieza programada. |

## Flujo (en este orden)

1. **Ruta del video.** Pídela si Felipe no la dio. Siempre absoluta (si es relativa, resuélvela con
   el directorio del proyecto donde está trabajando).

2. **Revisar.** Corre `revisar "<video>" --transcribir`. Devuelve:
   `info` (`ancho`, `alto`, `duracionMs`, `codec`, `tieneAudio`), `errores`, `avisos`,
   `cuadros` (`cover`, `story`, `clave[]`: rutas de imágenes), `transcripcion` (solo con
   `--transcribir`), `hashtagsBase` y `semanasConPlan`.
   - Si `errores` trae algo (no vertical, < 3 s, > 900 s, códec que no sirve): muéstralos y **para**.
   - Si `avisos` trae algo: muéstralos y pregunta si sigue. Si el aviso dice que el aspecto no es
     9:16, dile claro que **la portada recorta los lados**.
   - Si falla la transcripción o el video no tiene audio, sigue sin ella y dilo.

3. **Cuándo.** Pregunta «¿cuándo lo quieres publicar?» y traduce la respuesta:
   - «ahora» → `--cuando ahora` (el próximo :00 o :30 con al menos 15 min de margen).
   - Día y hora → `--cuando "AAAA-MM-DD HH:MM"` (hora de Chile). Resuelve «mañana», «el viernes»
     con la fecha de hoy.
   - Si la hora no es `:00` ni `:30`, proponle la más cercana y espera su respuesta.
   - Solo valen semanas que ya tienen plan (`semanasConPlan` de `revisar`). Si el error dice que la
     semana aún no tiene plan, explícaselo y pídele otra fecha.

4. **Caption y hook.** Mira con Read los `cuadros.clave` (y lee la transcripción si hay). Escribe:
   - **hook**: una frase corta que diga lo que el video entrega (va en `--hook`).
   - **caption**, para quien está aprendiendo: una idea, una acción, un ejemplo simple, sin
     jerga sin explicar. Firma como **@ia.punto.es** con «Te ayudo a partir…»; **nunca con el
     nombre de Felipe**. Termina con los `hashtagsBase` que devolvió `revisar`.
   - Límites: máximo **2200 caracteres** y **30 hashtags**.
   - Guarda el caption en un archivo del scratchpad (con Write, no con heredoc) y pásalo a
     `--caption-file`.

5. **Simulacro.** Corre `programar … --dry-run` (no escribe nada). Devuelve `semana`, `id`, `dia`,
   `hora`, `cercanas` (ids de piezas a menos de 2 h), `avisos`, `carpeta`, `programada: false`.
   Úsalo para validar día, hora, id y cercanías **antes** del OK. Luego **muestra todo**:
   - el caption completo y el hook;
   - la portada (`cuadros.cover`) y la story (`cuadros.story`) de `revisar`, con Read;
   - día y hora resueltos, y el `id`;
   - las `cercanas` (si hay, avisa que quedaría a menos de 2 h de esas piezas) y los `avisos`.

6. **Esperar el OK.** Solo un OK explícito en el chat («publícalo», «ok, programa», «dale
   adelante») sirve. Si pide cambios (caption, hora, hook), aplícalos, repite el paso 5 y vuelve a
   mostrar. Cualquier cambio exige un nuevo `--dry-run` y un nuevo OK.

7. **Programar.** Con el OK, corre el mismo comando **sin `--dry-run`**. Puede tardar (sube el
   plan a la base y dispara el render). Devuelve lo mismo más `programada` y `render`
   (`ok`, `salida`). Reporta lo que pasó:
   - `render.ok` y la salida trae la URL verificada → confírmalo y muestra la URL.
   - `render.ok` pero la salida viene vacía → dile que quedó programada y que el render horario la
     subirá (puede haber estado ocupado).
   - `render.ok` en `false` → muestra la salida tal cual; la pieza sigue programada y el render
     horario reintenta.
   - Error que dice «No quedó nada programado» → díselo tal cual y que puede reintentar.
   - Error que dice «No pude deshacer» → muéstrale los comandos de limpieza que trae el error,
     tal cual; no los corras tú.
   - Cualquier otro error: muéstralo tal cual y no reintentes sin avisarle.

## Prohibido

- Correr `programar` sin `--dry-run` antes del OK explícito de Felipe (y solo después de haberle
  mostrado el caption, la portada, la story, el día y la hora).
- Reemplazar o mover piezas del planificador.
- Editar `render.json` o `estado.json`, o tocar a mano `plan.json` y la carpeta de salida.
- Correr el comando desde `Carrusel` o desde el proyecto del video.
- Poner el nombre de Felipe en el caption o el hook.
