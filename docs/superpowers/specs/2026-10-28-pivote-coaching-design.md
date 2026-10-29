# Pivote a vitrina de coaching — diseño

Fecha: 2026-10-28 · Rama: `claude/pivote-coaching` · Origen:
[`informes/foresight-instagram-2026-10-28.md`](../../../informes/foresight-instagram-2026-10-28.md)

Las decisiones de Felipe van marcadas como **(decisión)**. Lo que decidí yo para poder construir va
marcado como **(mi decisión)**; Felipe puede cambiarlo antes de aprobar.

## Intención

Tras 27 piezas, la cuenta tiene 1 guardado, 1 compartido, 1 comentario y una permanencia de 2 a 4 s.
Felipe decidió pivotear: la cuenta deja de buscar alcance con temas que rotan y pasa a ser la
**vitrina de su coaching** para profesionales que adaptan su trabajo a la IA. La demanda real ya
existe en su red y está en el nivel cero («no sé por dónde partir, no sé qué es un agente»). La
barrera es el miedo, y lo que hace clic es «pregúntale a la IA cómo ayudarte».

Este cambio tiene que dejar el planificador semanal, el validador y el bot alineados con eso
**antes de que el planificador en la nube corra el domingo 2026-11-01 a las 06:00**. Si no, la
semana del 2026-11-02 sale con las reglas viejas.

## Metas

1. El planificador escribe **3 piezas por semana** de dos series:
   - **«Por dónde partir»** (`por-donde-partir`): nivel cero, en primera persona, con la pantalla.
   - **«Lo que construí»** (`lo-que-construi`): bitácora honesta del sistema de agentes de este
     repo.
2. **Cada pieza cierra pidiendo «escríbeme PARTIR»**, en el `Cta` y en el caption. El validador lo
   exige.
3. **El bot cuenta los DMs «PARTIR»** de desconocidos, sin guardar su contenido, y le avisa a Felipe
   por Telegram para que responda a mano.
4. **Las semanas 2026-11-02 y 2026-11-09 corren como un paquete** («paquete pivote-coaching»), sin
   experimento propio, y se evalúan el 2026-11-16 contra las metas del informe:
   - permanencia > 6 s;
   - ≥ 3 guardados o compartidos por pieza;
   - ≥ 3 DMs «PARTIR»;
   - 5 sesiones y ≥ 1 persona dispuesta a pagar (esto lo registra Felipe, fuera del sistema).
5. **El cambio queda registrado** en `reglas.json` para que el bucle mida el antes y el después.

## Lo que no entra

- **La voz clonada en ElevenLabs:** la hace la sesión «Narración de reels con voz clonada en
  ElevenLabs». Aquí solo se deja preparado: si esa PR no llega, los reels salen con Kokoro como
  hasta ahora.
- **El dashboard** (`~/.claude/scheduled-tasks/actualizar-dashboard-metricas/generar.py`): sumar los
  DMs y las metas nuevas va en una PR aparte, después de que existan los datos.
- **Responder DMs de forma automática.** Felipe responde a mano: es coaching y la primera
  conversación es suya.
- **LinkedIn, la cara y la oferta pagada.** Son decisiones posteriores al experimento.

## Antimetas (sería un fracaso aunque funcione)

- Que el bot conteste, guarde el texto o reenvíe el contenido de DMs de desconocidos.
- Que el planificador vuelva a rotar temas sueltos (finanzas, psicología, storytelling) porque una
  regla vieja sigue viva en `INSTRUCCIONES.md` o en el validador.
- Que el validador rechace la semana del 2026-11-02 y el domingo amanezca sin plan.
- Que la semana 2026-11-09 vuelva sola a las reglas de experimento de antes: el paquete dura dos
  semanas.

## Restricciones

- **AGENTS.md:**
  - Rama `claude/<tema>` y PR; nunca push a `main`.
  - `npm run typecheck && npm test` en verde.
  - No editar tests para que pasen. Los tests que fijan el mix de 6 o las series viejas se
    **actualizan porque cambia la regla**, y eso se explica en la PR.
  - Como toca la publicación, `/codex:adversarial-review` antes del merge.
- **`knowledge/` es otro repo.** La plantilla se edita en `kb-plantilla/` y se instala con
  `scripts/kb-calendario-install.sh`. Nunca se escribe en las zonas `kb:auto` ni `kb:research`.
- **`config.json` de la base es del usuario.** El instalador no lo sobreescribe si ya existe
  (verificar en el plan). Los cambios de config se aplican a la base a mano, en un commit propio, y
  se reflejan en la plantilla.
- **El validador valida la semana en curso y las futuras con el `config.json` vigente.** Ya hoy
  las semanas 2026-10-05 a 10-19 fallan con el config actual. No se versionan reglas por fecha:
  la semana 2026-10-26 deja de validar cuando se instala el config nuevo, y eso se acepta porque
  ya está planificada y renderizada **(mi decisión)**.
- **No se toca `src/` del render.** Los pilares siguen siendo los de siempre (`draft.ts`,
  `types.ts` y `theme.ts` los tienen fijos), así que la identidad nueva la lleva la `serie`, no
  el pilar **(mi decisión)**.

## El cómo

### 1. `config.json` (plantilla y base)

**(mi decisión) El mix:**

| Día | Hora | Formato | Arquetipo | Serie |
|---|---|---|---|---|
| Lunes | 09:00 | `reel` | `tutorial` | `por-donde-partir` |
| Miércoles | 09:00 | `reel` | `atemporal` | `lo-que-construi` |
| Viernes | 13:00 | `carrusel` | `lista` | `por-donde-partir` |

Por qué: los reels traen el alcance de no seguidores y el carrusel es lo guardable para quien ya
sigue. Se mantienen arquetipos que ya existen, así los pesos del bucle siguen comparables.

Otros cambios:
- `pilares`: sin cambios en la lista (el render la tiene fija). Las piezas de las dos series van con
  pilar `trabajo` o `herramienta`. `pilaresNota` explica el pivote.
- `series` **(nuevo)**: `["por-donde-partir", "lo-que-construi"]`. El validador lo lee en vez de la
  constante `SERIES_CALIDAD`. Sin `series` en el config, se usa la constante (compatibilidad).
- `paquete`: se reemplaza por `{ "desde": "2026-11-02", "semanas": ["2026-11-02", "2026-11-09"], "motivo": "paquete pivote-coaching" }`.
  Como `paquete.desde` también decide desde cuándo se exigen juez y series (`exigeJuez`), desde el
  2026-11-02 se siguen exigiendo los dos.
- `hookVideoMaxSemana: 0` (hoy es 5 en la base y 1 en la plantilla), `clipsMaxSemana: 0` (ya está).
- Las diferencias que ya existen entre el config de la base y el de la plantilla (`revisionVisual`,
  las notas) se conservan: los cambios se aplican sobre el config de la base, campo por campo.
- `cta` **(nuevo)**: `{ "palabra": "PARTIR", "desde": "2026-11-02" }`.
- `mixNota`: el pivote del 2026-10-28 y la referencia al informe.

### 2. Validador (`kb-plantilla/_calendario/validar.mjs`)

- **Mix:** aceptar de 3 a `7 × MAX_ENTRADAS_MIX_DIA` entradas (hoy, mínimo 6).
- **Series:** `config.series` si existe; si no, `SERIES_CALIDAD`. Desde `paquete.desde`, todo reel y
  todo carrusel llevan una serie de esa lista. Antes, los carruseles iban con `serie: null`.
  *(mi decisión: el carrusel también pertenece a una serie, para que la cuenta se reconozca.)*
- **La serie sigue el mix:** desde `paquete.desde`, cada entrada del mix trae `serie` y la pieza
  que la toma lleva la misma. El calce entre pieza y entrada suma la serie a lo que ya compara
  (hora, formato y arquetipo) **(mi decisión)**.
- **Señal nueva `dm`** en `SENALES` **(mi decisión)**. Desde `cta.desde` toda pieza va con
  `senal: "dm"`, porque la meta del experimento son las conversaciones. Así la pastilla y el
  cierre piden lo mismo, sin un «Guárdalo» compitiendo con «Escríbeme».
  - La pastilla (`cta`) con señal `dm` debe pedir «escríbeme» y la palabra.
  - `siglasProhibidas` acepta `cta.palabra` en mayúsculas en el `Cta`, igual que hoy acepta una
    palabra después de «Comenta».
  - El bucle no puede atribuir un DM a una pieza: para la señal `dm` mide por semana, con
    `_metricas/dms.jsonl`.
- **Cierre PARTIR:** desde `cta.desde`, el título o la pastilla del `Cta` y el `caption` contienen
  `cta.palabra` en mayúsculas.
- **Paquete:** ya se lee de `config.paquete`; solo hay que verificar que `MOTIVO_PAQUETE` no esté
  fijo en otro lugar.
- **Tests nuevos** en `test/calendario.ts`:
  - un mix de 3 válido;
  - una serie fuera de `config.series` rechazada;
  - un reel sin «PARTIR» rechazado desde `cta.desde`, y aceptado antes de esa fecha;
  - la señal `dm` con una pastilla que pide «Guárdalo», rechazada;
  - «PARTIR» en mayúsculas en el `Cta`, aceptado por `siglasProhibidas`.
- **Los tests existentes** que fijan el mix de 6 o las series viejas usan fixtures propios de
  config. Si alguno falla, se actualiza solo cuando la regla cambió, y la PR lo explica caso por
  caso.

### 3. Manual del planificador (`kb-plantilla/_calendario/INSTRUCCIONES.md`)

- **Una sección nueva al inicio:** «Propósito de la cuenta (desde 2026-11-02)», con el manifiesto
  en 5 líneas, la pregunta guía «¿por dónde parto con la IA en mi trabajo?» y la idea central
  «pregúntale a la IA cómo ayudarte».
- **Paso 3, temas:** se elige por la pregunta guía y la serie, no por rotación de temas. Siguen los
  requisitos de referencia lista y respaldo (regla dura 5). Ejemplos de ángulos:
  - Para `por-donde-partir`: qué es un agente, cómo pedirle a la IA que te enseñe, qué tarea delegar
    primero.
  - Para `lo-que-construi`: decisiones y errores reales de este sistema.
- **Paso 4, mix:** la tabla nueva reemplaza la de 6 piezas. El texto de «paquete calidad-contenido»
  pasa a «paquete pivote-coaching» (semanas 2026-11-02 y 2026-11-09, vence el 2026-11-15).
- **Paso 5, voz:**
  - Primera persona singular («yo armé», «a mí me pasó»).
  - Nivel cero sin jerga: un término técnico como máximo, y explicado.
  - Tono de quitar el miedo, no de vender herramientas.
  - Las reglas duras 6, 8 y 10 siguen. Para `lo-que-construi`, el «resultado» de la regla 8 es lo
    que se aprendió construyendo.
- **Una regla dura nueva (11), el cierre PARTIR:** el `Cta` y el caption piden «escríbeme PARTIR»
  y dicen qué recibe quien escribe. **(mi decisión)** El texto base es «Escríbeme PARTIR y te
  cuento por dónde empezar en tu caso», que promete una respuesta humana.
- **Paso 2, evaluar:** durante el paquete se reportan las metas del informe y no se proponen reglas
  nuevas.

### 4. Guías y lector frío

- **`guia-hooks.md` y `guia-redaccion.md`:** una sección «Desde 2026-11-02» con la voz en primera
  persona, ejemplos de hooks de nivel cero («No sabía qué era un agente hasta que le pregunté a la
  IA») y lo que ya no va (listas de herramientas, «10 prompts»).
- **`lector-frio.md`:** el lector pasa a ser «profesional de cargo medio que nunca ha usado IA más
  allá de una pregunta suelta y no sabe por dónde partir». Las preguntas P1 a P8 no cambian.

### 5. `reglas.json`

Una entrada nueva:

```json
{
  "id": "pivote-coaching",
  "desde": "2026-11-02",
  "formato": null,
  "descripcion": "Pivote a vitrina de coaching: mix de 3 piezas (2 reels + 1 carrusel), series por-donde-partir y lo-que-construi, primera persona, cierre PARTIR",
  "fuente": "informes/foresight-instagram-2026-10-28.md; PR del pivote"
}
```

### 6. Bot: conteo de DMs «PARTIR» (`src/kb/bot.ts`, `src/kb/inbox.ts`)

- **Una función pura nueva en `inbox.ts`:** `esPedidoPartir(ev: DmEvent, palabra: string): boolean`.
  Es verdadera si el texto, normalizado (sin tildes, mayúsculas, puntuación), contiene la palabra
  como palabra completa.
- **En `onDm`,** cuando el remitente **no** está en `igAllowed` y `esPedidoPartir` es verdadero:
  - **Registra una línea en `_metricas/dms.jsonl`** de la base: `{ "fecha": ISO, "palabra": "PARTIR", "remitente": <hash> }`.
    - El hash es un HMAC-SHA256 del IGSID con el app secret, truncado a 16 hex. Sirve para contar
      personas únicas sin guardar el id.
    - **Nunca se guarda el texto.**
    - Se escribe con el mecanismo de commit y push que ya usa la base (`store.ts`).
  - **Avisa por Telegram con `notifyAdmin`:** «📩 Alguien escribió PARTIR por DM en Instagram:
    respóndele en la app.» El aviso no lleva el id ni el texto.
  - **No responde por DM.**
- **Los demás DMs de desconocidos** siguen como hoy: se ignoran con un `console.warn`.
- **Deduplicación:** una persona que escribe PARTIR dos veces el mismo día cuenta una vez. Se
  revisa el hash más el día en `dms.jsonl` antes de agregar la línea.
- **Límite aceptado (mi decisión):** los PARTIR que lleguen con el bot caído (deploy o reinicio) no
  se cuentan. `recover.ts` sigue recuperando solo a remitentes autorizados. Felipe ve igual esos
  DMs en la app; si nota una diferencia, la anota a mano.
- **Verificación en vivo antes del lunes:** que un DM de alguien que **no sigue** a la cuenta
  (bandeja de solicitudes) llegue al webhook. Si no llega, la meta 3 se cuenta a mano.
- **Tests** en `test/kb.ts`:
  - `esPedidoPartir` con «partir», «PARTIR!», «Partir 🙏», «quiero partir con la IA» (verdadero) y
    «repartir», «compartir» (falso);
  - el registro no incluye texto ni IGSID.

### 7. Tareas programadas (fuera del repo, en `~/.claude/scheduled-tasks/`)

- **`calendario-insertar-piezas-2026-11-02`:** se desactiva. Sus 2 piezas ya están en la semana
  2026-10-26: la del martes se publicó el 27 y la del viernes está programada. Si corre, las
  duplica y mete una pieza el martes, que el mix nuevo no tiene.
- **Planificador en la nube y respaldo local:** no cambian, porque leen `INSTRUCCIONES.md`.
- **`calendario-hook-video`:** sin cambios; con `hookVideoMaxSemana: 0` no hay pendientes.

### 8. Memoria (fuera del repo)

Las 4 notas que el pivote reemplaza llevan una primera línea «Reemplazado por
[[pivote-coaching-2026-10-28]] desde 2026-11-02», y su entrada en `MEMORY.md` lo dice:
`aprendizaje-acelerado-fase-absoluta`, `pivote-formato-reels-2026-10-17`,
`linea-trabajo-con-ia-2026-10-18` y `publico-profesional-calidad-2026-10-22`.

## Orden y despliegue

1. PR con los puntos 1 a 6 (plantilla, validador, bot y tests) y revisión adversarial.
2. Merge. Antes de instalar, editar a mano `knowledge/_calendario/config.json` (mix, series, cta,
   paquete, `hookVideoMaxSemana: 0`), en la misma sesión: el instalador corre `--self-test` y falla
   con el config viejo, y Obsidian commitea la bóveda cada pocos minutos (una instalación a medias
   podría subirse). Luego `scripts/kb-calendario-install.sh` y `node _calendario/validar.mjs --self-test`.
3. Desplegar el bot en GCP (el procedimiento habitual de `deploy/`).
4. Puntos 7 y 8.
5. **Límite: sábado 2026-10-31.** **Plan B:** si no se instala a tiempo, la semana 2026-11-02 se
   planifica a mano como la del 2026-10-19, y la rutina del domingo termina sin hacer nada porque
   `plan.json` ya existe.

## Lo que queda al criterio de quien construye

- Los nombres internos, el orden de las funciones y la forma exacta de los mensajes de error del
  validador, siguiendo los existentes.
- Cómo escribir `dms.jsonl` dentro de lo que ya ofrece `store.ts`.
- La redacción final de las secciones nuevas del manual, siempre que cubran lo de arriba.

## Terminado cuando

- `npm run typecheck && npm test` salen 0, con los tests nuevos de los puntos 2 y 6.
- `node kb-plantilla/_calendario/validar.mjs` acepta una semana de ejemplo del 2026-11-02 con el mix
  de 3 y rechaza una a la que le falta PARTIR. El ejemplo de `INSTRUCCIONES.md` («Ejemplo completo»)
  se reemplaza por esa semana, y el test que compara el ejemplo con el validador sigue pasando.
- La PR está abierta con la revisión adversarial pedida.
