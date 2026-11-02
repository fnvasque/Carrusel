---
name: caso
description: Use when Felipe escribe «/caso», «cuenta cómo hice…», «arma el caso de este proyecto» o pide convertir un proyecto hecho con Claude en una historia paso a paso (PDF, carrusel y reel sin voz) para @ia.punto.es.
---

# /caso — contar cómo se hizo un proyecto

Convierte las conversaciones de Claude de un proyecto en una historia paso a paso que alguien
que está aprendiendo pueda seguir, y después en un PDF, un carrusel y un reel sin voz. Todo
queda en `<proyecto>/caso/` (ignorada por git). **Nunca publica ni toca el calendario.**

Todos los comandos se llaman así (la ruta del proyecto siempre absoluta):

```
npm --prefix ~/Documents/Claude/Carrusel run -s caso -- <sub> "<proyecto>" …
```

Si las conversaciones están en otra carpeta (por ejemplo la carpeta madre), agrega
`--sesiones-de "<carpeta>"` a `sesiones`, `trozar` y `numeros`.

## Reglas de privacidad (no se negocian)

- Clientes, empresas y personas reales se cambian por **roles** («una clienta», «la empresa
  de logística», «una colega»). Nunca nombres reales, ni de pila ni apodos.
- Nunca copies salidas de herramientas (resultados de comandos, archivos leídos) a la historia
  ni a los resúmenes. Los prompts sí, sin nombres, rutas ni datos.
- Sin rutas, correos, teléfonos, RUT, claves ni enlaces privados.
- La pieza firma como **@ia.punto.es** con «Te ayudo a partir…»; **nunca con el nombre Felipe**.
- Nada de esto se commitea en el repo Carrusel.

## Flujo

1. **Qué logro contar.** Pregúntale a Felipe qué logro quiere contar si no lo dijo. Corre
   `sesiones` y **propón** cuáles pertenecen a ese logro (por tema de los mensajes, fechas y
   carpetas tocadas). Si es una carpeta con varios proyectos mezclados, di cuáles sesiones dejas
   fuera y por qué. **Espera a que Felipe confirme.**

2. **Números y trozos.** Con los ids confirmados corre `numeros` y `trozar`. Lanza **un
   subagente por trozo**: pásale la ruta de su archivo (`<proyecto>/caso/trabajo/<id>-NN.md`) y
   esta instrucción:
   > Lee solo este archivo: <ruta>. No abras ningún otro archivo ni carpeta.
   > Resume en español este trozo de una conversación: qué quería la persona, qué referencias
   > usó, qué se probó, qué falló y cómo se arregló, y los prompts clave. Reemplaza clientes,
   > empresas y personas por roles. No copies salidas de herramientas, rutas, enlaces ni datos.
   > Devuelve solo el resumen.

   Nunca pegues trozos crudos en la historia; trabaja con los resúmenes.

3. **Archivos e imágenes.** Lee los archivos del proyecto que sean versiones o análisis
   (`_v2`, notas, guiones) para entender cómo avanzó. Mira las imágenes candidatas y **descarta
   las que muestren datos** (nombres, correos, pantallas con información de clientes). Copia las
   elegidas con `imagen "<proyecto>" "<ruta>"` y úsalas como `![](imagenes/<nombre>)`.

4. **Historia.** Escribe `caso/historia.md` con `historia-plantilla.md` (en esta carpeta), en
   lenguaje de aprendiz: frases cortas, una idea por párrafo, ejemplos simples, sin jerga sin
   explicar. Luego:
   - corre `tapar "<proyecto>/caso/historia.md"`;
   - haz **tu propia pasada** buscando clientes, empresas y personas (nombres, apodos, iniciales)
     y cámbialos por roles;
   - en `## Para Felipe: qué se tapó` copia solo el **resumen por tipo y cantidad** que imprimió
     `tapar` (por ejemplo «ruta: 3, correo: 1») y los reemplazos por rol, **nunca el valor original**.

   Las secciones `## Para Felipe: …` no salen en el PDF.

5. **Parar.** Muéstrale la historia completa a Felipe y **detente**. Solo si responde en el chat
   escribiendo **«apruebo»** o **«aprobada»** corre `aprobar`. Cualquier otra respuesta («dale»,
   «ok», «se ve bien») no es aprobación: pregúntale si la aprueba. Si pide cambios,
   edita, vuelve a correr `tapar` y vuelve a mostrarla. Si la historia cambia después de
   aprobarla, hay que aprobarla de nuevo (la puerta lo exige).

6. **Pieza.** Escribe `caso/borrador.json`:
   - Formato `Borrador` de `~/Documents/Claude/Carrusel/src/calendario/draft.ts`; plantillas y
     sus props en `src/remix/templates-catalog.ts` (Hook, Step, Prompt, Screen, Stat, Clip, Cta…).
     Ejemplo válido: `borrador-ejemplo.json` en esta carpeta.
   - Fondos: solo `color`, `gradient` o `image` con un archivo de `imagenes/`. **Nunca fondos
     `ai` ni `hookVideo`** (la puerta los rechaza). Lo normal es **no poner fondo**: las plantillas
     escriben en tinta oscura sobre papel claro, y un color, degradado o imagen oscuros dejan el
     texto ilegible (solo `Clip` va sobre negro con texto claro). Para mostrar el proyecto usa una
     escena `Clip`.
   - Si el reel muestra video del proyecto: `clip "<proyecto>" "<video>" <desde> <hasta> <nombre>`
     y una escena `Clip` con `"archivo": "<nombre>.mp4"`.
   - Cierre con `Cta`: `"handle": "@ia.punto.es"` y `"reason": "Te ayudo a partir con la IA en tu
     trabajo"`. Ningún texto dice «Felipe».
   - El reel es **sin voz** (no pongas `narracion`).

   Corre `generar "<proyecto>"` (o `--solo-pdf` para revisar primero la guía). Si la puerta da
   motivos, corrígelos en `borrador.json` y repite. Arreglar el borrador nunca toca `historia.md`.
   Si el motivo es que la historia no está aprobada o cambió, vuelve al paso 5: muéstrasela a
   Felipe; nunca corras `aprobar` sin su aprobación explícita en el chat. Muéstrale a Felipe las rutas del PDF, el carrusel y el reel, y
   los **avisos** (puntaje y revisión visual) tal cual. No publiques ni toques el calendario.
   Felipe mira cada slide del carrusel y el reel completo antes de usarlos: la aprobación de la
   historia no cubre lo que dicen o muestran las piezas generadas. Si pide cambios, edita
   `borrador.json` y vuelve a correr `generar`; nada se da por listo hasta que él lo diga.

## Comandos

| Comando | Qué hace |
|---|---|
| `sesiones <proyecto>` | Lista conversaciones: id, fechas, tamaño, carpetas y primeros 3 mensajes (tapados) |
| `trozar <proyecto> <id…>` | Escribe `caso/trabajo/<id>-NN.md` (ya tapados) |
| `numeros <proyecto> <id…>` | Escribe `caso/numeros.json` |
| `tapar <archivo>` | Tapa datos sensibles en un archivo de `caso/` e imprime tipo y cantidad |
| `imagen <proyecto> <ruta>` | Copia la imagen a `caso/imagenes/` |
| `clip <proyecto> <video> <desde> <hasta> <nombre>` | Recorta un clip sin audio a `caso/clips/` |
| `aprobar <proyecto>` | Aprueba `caso/historia.md` (solo tras el «apruebo» o «aprobada» de Felipe) |
| `generar <proyecto> [--solo-pdf]` | Genera `caso/caso.pdf`, el carrusel y el reel en `caso/salida/` |
