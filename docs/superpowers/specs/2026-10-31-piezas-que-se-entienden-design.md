# Piezas que se entienden — diseño

Fecha: 2026-10-31. Estado: los 9 puntos los aprobó el usuario en conversación, uno por uno.
Versión 2, después de una revisión adversarial (hallazgos al final, en «Qué cambió con la
revisión»).

## Por qué

El planificador escribe las piezas y el usuario las corrige porque «no se entendía el contexto,
o para qué servía, o le faltaban hilativos». Evidencia:

- **Corrección del usuario al reel `sab-pm-reel-haz-que-te-pregunte`** (2026-10-31, contra
  `sab-reel-le-pedi-que-me-entrevistara`): portada con problema y salida («¿No sabes qué
  pedirle a la IA? Haz que te pregunte a ti»); pasos dichos al lector («Copia este mensaje y
  pégalo en ChatGPT», «Respóndele como a un colega nuevo» + «Qué haces, cuánto te demora y para
  quién es»); el ejemplo completo («Informe semanal: 3 horas, notas sueltas, para mi jefe»); una
  escena del porqué («Funciona porque la IA no conoce tu trabajo: tus respuestas se lo
  cuentan»); fuera las escenas que solo contaban la experiencia («preguntó la IA, no yo»).
- **Caídas de la semana 2026-10-26** (`knowledge/_calendario/2026-10-26/plan.json → caidas`):
  `dom-reel-mis-agentes-y-1-guardado` cayó en 5 vueltas por tema (Instagram no es el trabajo
  del lector), por un concepto sin explicar («proyecto de Claude») y por una pantalla que no se
  conectaba con el resto; el carrusel del viernes cayó por una contradicción que creó el parche
  de la vuelta anterior.
- **El orden de escritura ya pone el hilo primero** (`INSTRUCCIONES.md`, «Orden obligatorio»)
  y `validar.mjs` exige `fraseAmigo`. Lo que falta es **comprobar que las escenas cumplen esa
  frase**.
- **Spec 2026-10-24 (`contenido-compartible`)**: ya diagnosticó «la puerta remienda en vez de
  descartar»; su banco de momentos nunca se implementó.
- **Contradicciones internas hoy**:
  - Voz: `guia-redaccion.md` y `guia-hooks.md` piden primera persona en el cuerpo y ponen como
    **mal** «Sube tus informes…», mientras «Reels sin voz» (PR 77) y la corrección del usuario
    usan pasos en segunda persona.
  - Ritmo: `guia-hooks.md` (y la decisión del usuario del 2026-10-30, «reels sin voz van en
    `ensenar`») contra `INSTRUCCIONES.md:695` y `validar.mjs` (`erroresDeRetencion`), que en las
    semanas del paquete exigen `pace` = `puerta.ritmoReel` = `gancho`. En `gancho` la portada
    dura 3 s y la `Screen` del medio ~4–5 s: no cabe prompt + respuesta. **El planificador del
    domingo 2026-11-01 escribiría reels ilegibles o caería.**
  - Validador vs. motor: `segundosEscenas` (validar.mjs) alarga cada escena por su
    `narracion` aunque `config.voz` sea `false`; el motor no narra y no la alarga
    (`renderReel.ts`). El validador aprueba escenas que el render muestra demasiado poco tiempo.

## Lector (decisión del usuario, 2026-10-31)

Empleado con IA a mano (ChatGPT gratis, Gemini o Copilot del trabajo), **no paga por IA y la
usa como Google**: hace una pregunta, lee y cierra. Dos vacíos: **no se le ocurre en qué tareas
de su semana usarla** y **no sabe qué tipos de cosas puede hacer** (imágenes, video, texto a
audio, audio a texto, búsqueda con fuentes, leer una foto o un documento). Se suma al perfil
vigente (cargo medio, nivel cero, no sabe por dónde partir).

## Metas, no metas y anti-metas

1. Las piezas llegan entendibles: de qué se trata, para qué le sirve, pasos de corrido.
2. El usuario corrige menos, y se mide (`correcciones.md`).
3. El sistema queda igual o más corto: se reemplazan reglas, no se suman capas.

**No metas:** cambiar `src/reel/timing.ts`, la duración máxima (35 s), las plantillas
visuales, la publicación, el juez de hooks, el score léxico, `config.json`.

**Anti-metas:** piezas más largas que no se entienden mejor; más vueltas de lector frío sin
menos correcciones; reglas que se cumplen en la forma y no en el fondo.

## Decisiones

| # | Punto | Decisión | De quién |
|---|---|---|---|
| 1 | De qué tratan | Banco `_calendario/momentos.md`: **momentos** × **capacidades**. Una pieza de `por-donde-partir` declara un momento y una capacidad. Cada capacidad lista sus **referencias de respaldo** (que dicen que se puede hacer gratis); una capacidad sin respaldo no se usa todavía y el planificador la pide a la investigación en `candidatos.json`. | Usuario (lector, capacidades); agente (formato) |
| 2 | Hilo | El hilo es una **secuencia de pasos dirigidos al lector** (qué copia, cómo responde, qué ve, por qué funciona), cada escena el paso siguiente de la anterior, más una escena del porqué. Se escribe como `guion` (un paso por escena) **antes** de las escenas. | Usuario (por su corrección); agente (campo) |
| 3 | Quién revisa | Pregunta 9 del lector: contarlo en dos frases a un compañero (de qué se trata y qué haría primero). En el completo **bloquea** si no nombra el primer paso del `guion` con su qué o su cómo, o si la idea no es la de `fraseAmigo`. En el con prisa no bloquea. | Agente, aprobado |
| 4 | Palabras | **Hasta 20 palabras por escena, mejor si son menos; lo que manda es que se entienda.** Reemplaza las reglas prácticas de ≤ 12 / ≤ 10 / ≤ 7 / ≤ 5. Los topes duros del validador (lectura a 2,5 palabras/s en el tiempo de la escena y 35 s en total) siguen: en la práctica, con 35 s caben 4 o 5 escenas largas, no 6. | Usuario |
| 4b | Tiempos | **No se cambian los tiempos por escena**: `timing.ts`, `lecturaPalabrasPorSegundo`, `duracionMaxSegundos` intactos. | Usuario |
| 4c | Ritmo sin voz | Mientras `config.voz` sea `false`, el ritmo vigente de los reels es **`ensenar`**, también en las semanas del paquete (la decisión del usuario del 2026-10-30). El validador lo aplica sin tocar `config.json`. | Usuario (2026-10-30); agente (mecánica) |
| 4d | Narración sin voz | Con `config.voz === false` el validador **no** alarga escenas por `narracion` (igual que el motor). Es una corrección del validador para que mida lo que se renderiza. | Agente (corrección de un error) |
| 5 | Costo | Si falla una condición del lector frío, se **reescribe la pieza entera desde el `guion`** (primero se revisa el guion), no una frase. Tras dos fallas del lector, la tercera vuelta **cambia de momento** (en `lo-que-construi`, de ángulo). `reescriturasMax` (3) no cambia; las vueltas por errores del validador siguen contando. Si no pasa, cae. | Agente, aprobado |
| 6 | Medir | `_calendario/<semana>/correcciones.md`: una línea por corrección del usuario con su causa (`contexto`, `para-que`, `hilo`, `otro`). El planificador la crea y lee la de la semana anterior en el Paso 1. Métrica: correcciones por pieza. | Agente, aprobado |
| 7 | Plantillas | La plantilla se elige **después** del texto de la escena. Tabla corta en `guia-redaccion.md`. | Agente, aprobado |
| 8 | Conciliar | Inventario abajo. | Agente, aprobado |
| 9 | Semana 2026-11-02 | **Piloto hecho a mano** esta noche (el planificador no toca una semana con `plan.json`). El usuario corrige y anota en `correcciones.md`. | Usuario |

### Voz: pasos al lector (mi decisión, a revisar por el usuario)

En `por-donde-partir` **los pasos se le dicen al lector** («Copia este mensaje», «Respóndele
como a un colega nuevo»): tiene que poder hacerlos, y así los corrigió el usuario. La primera
persona queda para lo que me pasó o lo que no funcionó, cuando suma. `lo-que-construi` sigue en
primera persona (es bitácora), con el paso para el lector al final. La portada ya le habla al
lector. Se corrigen todas las menciones que dicen lo contrario: `INSTRUCCIONES.md` (manifiesto
1, perfil, Paso 3, tabla del mix, Paso 5 «Voz»), `guia-redaccion.md` («A quién le escribes»,
«Desde 2026-11-02», ejemplo de la línea ~313, chequeo 12 y 13) y `guia-hooks.md` («la portada
le habla al lector; el cuerpo va en primera persona»). Manifiesto 1 queda: «Muestro lo que yo
hice y te digo cómo hacerlo tú».

## Cambios por archivo (en `kb-plantilla/`, salvo lo indicado)

### `_calendario/momentos.md` (nuevo)

- `## Momentos`: una línea por momento, `` - `id`: descripción ``. Semilla de 12:
  `responder-correo-delicado`, `acta-de-reunion`, `leer-documento-largo`,
  `presentacion-para-el-jefe`, `formula-de-excel`, `conversacion-dificil`, `ordenar-la-semana`,
  `revisar-mi-texto`, `informe-semanal`, `entender-tema-nuevo`, `responder-en-ingles`,
  `preparar-evaluacion`.
- `## Capacidades`: `` - `id`: descripción — respaldo: `referencias/a.md`, `referencias/b.md` ``
  o `— respaldo: ninguno todavía`. Semilla (respaldo verificado en la base el 2026-10-31):
  - `escribir-y-corregir` — `prompt-con-contexto-ejemplos-e-iteracion.md`
  - `leer-documentos` — `notebooklm.md`, `empezar-con-ia-sin-pagar.md`, `modo-estudio-de-chatgpt.md`
  - `leer-fotos` — `modo-estudio-de-chatgpt.md` (subir la foto de un ejercicio, plan gratis)
  - `texto-a-audio` — `notebooklm.md` (resumen en audio en español, gratis)
  - `audio-a-texto` — `dictado-por-voz-en-chatgpt.md` (dictado en todos los planes)
  - `buscar-con-fuentes`, `hacer-imagenes`, `hacer-videos` — ninguno todavía
- Lo escribe el usuario; el planificador no lo edita. Propone momentos nuevos en
  `aprendizajes.md` (línea `momento propuesto: <id>: <descripción>`), y pide respaldo para una
  capacidad en `candidatos.json` (`proxima-semana`, con el tema que la cubriría y el detalle
  «opción gratis para <capacidad>»).
- `kb-calendario-install.sh` lo copia **solo si no existe** (como `config.json`).

### `plan.json` (campos por pieza)

- `momento`, `capacidad` (ids del banco): en `serie: "por-donde-partir"`.
- `guion`: lista de textos, **uno por slide**: el paso que esa escena le da al lector.

### `validar.mjs`

Desde `DESDE_ENTENDER = "2026-11-09"` (las semanas anteriores no cambian, salvo 4c y 4d):

- `guion`: lista con tantas entradas como slides del borrador, cada una de 2 a 20 palabras.
- `momento` / `capacidad` en `por-donde-partir`: existen en `momentos.md` (si falta el archivo,
  error que pide correr el instalador); la capacidad tiene respaldo y al menos una de sus
  referencias está en `origen.referencias`; la combinación no se repite en la misma semana ni
  en las 4 anteriores (lee los `plan.json` de las carpetas hermanas; `validarPlan` recibe los
  planes anteriores como argumento opcional).

Para toda semana (son correcciones de cómo se mide, no reglas nuevas):

- **4c** `ritmoVigente(config)`: `"ensenar"` si `config.voz === false`; si no,
  `puerta.ritmoReel`. Lo usan `erroresDeRetencion` en el paquete y los textos de error.
- **4d** `segundosEscenas` / `duracionReel` no aplican `conNarracion` si `config.voz === false`.
  Tiene que coincidir con `src/reel/renderReel.ts`.

### `lector-frio.md`

- Pregunta 9 en «Para el lector»: «Cuéntaselo en dos frases a un compañero de trabajo que no lo
  vio: de qué se trata y qué harías primero.» El JSON de respuesta suma `"9"`. `--lector` la
  copia solo (lee la sección).
- Criterio 9 (texto nuevo, en una frase aparte; no se reescribe lo que fijan los tests): en el
  completo bloquea si no nombra el primer paso del `guion` con su qué o cómo, o si la idea no
  es la de `fraseAmigo`; en el con prisa, `NB` con `con prisa P9: no bloquea` (el `NB_RE`
  actual ya lo acepta).
- Reescritura: «se reescribe la pieza entera desde el `guion`; tras dos fallas, se cambia de
  momento».

### `INSTRUCCIONES.md`

- Propósito: lector ampliado; manifiesto 1 precisado; voz.
- Paso 1: leer `momentos.md` y la `correcciones.md` de la semana anterior.
- Paso 3: en `por-donde-partir`, primero momento × capacidad con respaldo (sin repetir en 4
  semanas), después el tema elegible de una de las referencias de respaldo.
- Paso 4 (paquete): el ritmo es el vigente (`ensenar` sin voz).
- Paso 5: «guion» entra entre «frase de amigo» y «lo nuevo»; «Cuerpo» pasa a «escenas desde
  el guion»; la plantilla se elige al escribir cada escena. Presupuesto: «hasta 20, mejor
  menos». Tope de duración: con escenas largas caben 4 o 5. Voz.
- Paso 6/7: reescritura desde el guion y cambio de momento.
- Paso 8: crear `correcciones.md`; sumarla a «Escribe solo…» y al `git add`.
- Ejemplo de `plan.json` (lo copia el planificador): `momento`, `capacidad`, `guion`.

### `guia-redaccion.md` / `guia-hooks.md`

- Voz (arriba). Regla corta nueva «El hilo: cada escena es el paso siguiente», con el antes y
  después del reel `haz-que-te-pregunte`. «7. Cuánto cabe»: hasta 20 palabras, mejor menos; sin
  voz, ritmo `ensenar`. Tabla «qué plantilla para qué». Lista de chequeo: el 7 y el 12.
- `guia-hooks.md`: solo la línea de voz; la portada sigue igual (PR 77).

### `reglas.json`

`{"id": "piezas-que-se-entienden", "desde": "2026-11-02", "formato": null, "descripcion":
"guion de pasos al lector, P9 de corrido, reescritura desde el guion, banco momento ×
capacidad, hasta 20 palabras por escena, ritmo ensenar sin voz", "fuente": "<esta spec>"}`.
El 2026-11-02 es el piloto aplicado a mano; desde el 2026-11-09 lo exige el validador.

### Código

- `src/calendario/lector-causas.ts`: causa `sin-hilo` por palabras clave en los fallos (sin `pregunta`: un test fija que la 9 no tiene causas propias, y el NB del con prisa no bloquea).
- `scripts/kb-calendario-install.sh`: `momentos.md` solo si no existe.

### Inventario (punto 8)

| Regla | Qué pasa |
|---|---|
| `promesas` | Se queda |
| Reglas prácticas ≤ 12 / ≤ 10 / ≤ 7 / ≤ 5 | Se reemplazan por «hasta 20, mejor menos» |
| «Primera persona en el cuerpo» y su mal/bien | Se reemplaza por la voz de arriba |
| Chequeo 12 | Se reemplaza |
| «Cuerpo: las slides del medio» | Se reemplaza por guion + escenas |
| «Reescribe y vuelve a lanzar» | Se reemplaza por reescritura desde el guion / cambio de momento |
| Paquete: pace = `gancho` | Se reemplaza por el ritmo vigente (`ensenar` sin voz) |
| Juez, score léxico, topes duros, tiempos | Sin cambio |

Meta era no crecer más de 40 líneas netas; quedó en +73 (2134 → 2207) aun quitando dos notas históricas. Lo nuevo (banco, guion, correcciones) no tenía dónde reemplazar.

## Piloto: semana 2026-11-02

- Se escribe a mano en `knowledge/_calendario/2026-11-02/` antes del domingo 06:00, con el mix
  vigente (lun reel `por-donde-partir`, mié reel `lo-que-construi`, vie carrusel
  `por-donde-partir`), con este diseño completo: momento × capacidad con respaldo, `fraseAmigo`
  → `guion` → escenas, juez de hooks, promesas, ambos lectores fríos con la pregunta 9 y
  reescritura desde el guion. Reels en `ensenar`, ≤ 35 s.
- Se valida con el `validar.mjs` de esta rama (el instalado todavía exige `gancho` en el
  paquete), y también con el instalado, para dejar anotado si solo falla por el ritmo.
- Se crea `correcciones.md` vacía.
- Si no está antes de las 06:00, el planificador escribe la semana con las reglas de hoy y el
  piloto pasa a reescribirla a mano.

## Cómo se verifica

1. `npm run typecheck && npm test` en 0, con tests nuevos: `guion` faltante o de largo distinto,
   rechazado desde 2026-11-09 y aceptado antes; momento o capacidad inexistentes, capacidad sin
   respaldo o sin su referencia en `origen`, combinación repetida en 4 semanas: rechazados;
   paquete sin voz acepta `ensenar` y rechaza `gancho`; con voz sigue la puerta; sin voz la
   narración no alarga escenas; el mensaje de `--lector` trae la pregunta 9; causa `sin-hilo`.
2. `node kb-plantilla/_calendario/validar.mjs --self-test` en 0.
3. Revisión independiente del diff antes del merge (AGENTS.md: cambia la puerta).
4. Piloto: el usuario lee las 3 piezas y anota en `correcciones.md`.

## Fuera de alcance

Render, `timing.ts`, plantillas visuales, publicación, juez, score léxico, investigación
semanal, `config.json`.

## Decisiones que tomé yo (para revisar)

1. Pasos en segunda persona en `por-donde-partir`; primera persona cuando suma.
2. Validación nueva desde 2026-11-09; 4c y 4d para toda semana.
3. 4c sin tocar `config.json`: el validador deriva `ensenar` de `voz: false`, como decidió el
   usuario el 2026-10-30. Si se reconecta la voz, vuelve `puerta.ritmoReel`.
4. Capacidades sin respaldo quedan en el banco, marcadas, y no se usan hasta que la base tenga
   una referencia gratis.
5. Ids y textos de la semilla.
6. La pregunta 9 la evalúa el planificador contra `guion` y `fraseAmigo`; se cita textual.

## Qué cambió con la revisión del diff (segunda revisión independiente)

- Con la base viva sin voz, el ejemplo embebido (escrito con voz, `gancho`) dejaba de pasar
  `--self-test` y el instalador se cortaba a medias → `--self-test` valida el ejemplo con
  `VOZ_EJEMPLO` cuando la base no tiene voz y avisa que sin voz los reels van en `ensenar`.
  Cambiar la voz de la plantilla a `false` rompía 10 tests que dependen de ella: se descartó.
- Fuera del paquete, sin voz, un reel en `gancho` pasaba si `parametros.ritmoReel` decía
  `gancho` → sin voz el validador exige `ensenar` siempre.
- Textos de `INSTRUCCIONES.md` que seguían diciendo `gancho` para todo reel → «con voz / sin voz».

## Qué cambió con la revisión adversarial

- 20 palabras no cabían en `gancho` y el paquete forzaba `gancho` → 4c.
- El validador alargaba escenas por una voz que no existe → 4d.
- `candidatos.json` no acepta `momento-nuevo` → momentos propuestos van en `aprendizajes.md`.
- La frase fija en las notas («se reescribió desde el guion») y «guion distinto del título»
  eran chequeos de forma → se quitan; la P9 se compara con el `guion`.
- Capacidades sin respaldo gratis en la base → respaldo por capacidad, verificado.
- La voz en primera persona estaba en más lugares → lista completa arriba.
