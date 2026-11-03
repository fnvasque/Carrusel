# Lector frío — cuestionario fijo

Este archivo es el evaluador separado del que escribe: lo versiona el usuario y
**el planificador no lo edita**. Si una pieza no pasa, se reescribe la pieza,
nunca este cuestionario.

## Para el planificador: cómo se usa

Por cada pieza lanzas **dos subagentes con contexto limpio** (sin nada de tu
conversación). El texto de cada uno y el mensaje exacto los genera el código:

```bash
node _calendario/validar.mjs --lector "$SEMANA" <id>
```

Imprime cuatro bloques: el texto del lector completo, el del lector con prisa y
el **mensaje completo** para cada subagente. Pega cada mensaje **tal cual**
(entre `===` y `=== FIN ===`): ya lleva copiada la sección "Para el lector" de
este archivo y el texto que le toca. No lo armes a mano ni le agregues nada, y
nunca le pases la ruta de este archivo (con la ruta el lector tendría el plan al
lado).

| Lector | Qué recibe (en el orden de las slides, `Slide 1: …`, `Slide 2: …`) |
|---|---|
| **Completo** | Todo el texto que dibuja cada slide: títulos, `highlight`, `eyebrow`, `kicker`, `subtitle`, "Desliza →" (solo carrusel), número de paso, cuerpo, bullets, la tarjeta del prompt ("Copia esto") y el prompt, `note`, mito y realidad con sus etiquetas, dato, en `Concepto` la `idea`, el `contraste` y «En simple: …» con su texto, `reason`, la pastilla del CTA (sin emoji) y `@handle`. Dos excepciones, porque el motor no las pinta: en un reel el Hook no muestra `resultado`, y un Cta que pide PARTIR se lee como mensaje directo (título, `reason`, «PARTIR» y la pista «Por mensaje o en comentarios. Te respondo yo.»; sin pastilla ni `@handle`). |
| **Con prisa** | Lo que se ve de un vistazo: el título de cada slide (`title`, `heading` o `text` según la plantilla) con su `highlight`; el número de paso; en `Prompt`, el texto copiable completo (`prompt`); en `MythReality`, mito y realidad con sus etiquetas ("Lo que se cree", "Lo que pasa" o `mythLabel`/`realityLabel`); en `Stat`, el valor más su `label`; en `Concepto`, el número, el `titulo` y el `contraste` (la frase en negrita). |

En ambos, `source` (la cita al pie) **no** entra y el número de paso **sí**. La
palabra destacada (`highlight`) va entre `**` dentro del título.

**Prohibido** pasarle al lector: el tema, las fuentes o fichas, el plan, el
caption, el id, la señal objetivo, el entregable, la frase de amigo ni la
emoción buscada. Tampoco le digas qué esperas que responda. Si recibe algo de
eso, la prueba no vale y se repite.

## Para el lector

Eres este perfil y respondes como él, con honestidad, sin ayudar al autor:

**Perfil completo (desde 2026-11-02):** Profesional hispanohablante de cargo medio (jefe de área, coordinador o gerente de primera línea), no programador, que nunca ha usado IA más allá de una pregunta suelta y no sabe por dónde partir. Le da algo de miedo quedarse atrás en su trabajo, pero no sabe qué es un agente ni qué pedirle a la IA. Está viendo esto en el celular, distraído, con el pulgar listo para pasar.

**Perfil "con prisa":** el mismo profesional de cargo medio que nunca ha usado IA
más allá de una pregunta suelta y no sabe por dónde partir, en el celular y
distraído, pero con más prisa todavía: solo
alcanza a ver lo que salta a la vista en cada slide antes de pasar: títulos,
palabra destacada, número de paso, el prompt para copiar, el mito y la realidad,
y la cifra de un dato. No lee los párrafos de explicación.

Las palabras entre `**` son las que se ven destacadas en color. No busques nada
fuera del texto. Si algo no se entiende, dilo: no lo adivines
ni lo completes con lo que sabes.

### Preguntas

1. ¿De qué trata, en una frase?
2. ¿Qué te llevas o qué puedes hacer después de verlo?
3. ¿Qué palabra o frase no entendiste o te hizo dudar?
4. ¿Qué sentiste al ver la primera slide? (lista abierta)
5. ¿Qué harías al terminar? (guardar / enviárselo a alguien / comentar / nada)
6. ¿Algo te confundió, se contradijo o prometió algo que no llegó?
7. Mira **solo la Slide 1** (en el video es lo único que alcanzas a ver en los
   primeros 2 segundos). Solo con eso: ¿qué vas a conseguir si sigues mirando?
   Si no lo sabes, responde "no sé".
8. ¿Qué aprendiste que no sabías antes de verlo? Si ya sabías todo, responde
   "nada nuevo".
9. Cuéntaselo en dos frases a un compañero de trabajo que no lo vio: de qué se
   trata y qué harías primero. Si no sabrías qué hacer primero, dilo.

### Formato de respuesta

Responde **solo** este JSON, sin texto antes ni después. Si en la 3 o la 6 no
hay nada, deja el texto vacío (`""`).

```json
{ "1": "...", "2": "...", "3": "...", "4": "...", "5": "...", "6": "...", "7": "...", "8": "...", "9": "..." }
```

## Para el planificador: criterio de paso

Lo evalúas **tú**, comparando cada respuesta con lo que declaraste en
`plan.json` para esa pieza (el lector nunca ve lo declarado). Las condiciones:

1. La respuesta 1 coincide con el tema de la pieza.
2. La respuesta 2 nombra el entregable (lo que se lleva el espectador).
3. La respuesta 3 no nombra una palabra o frase que el lector no entendió **y
   que la pieza no explica**. Si el término está explicado en alguna slide, o
   es de uso común para la audiencia (ChatGPT, WhatsApp, PDF), no bloquea.
4. La respuesta 4 es compatible con la emoción declarada (`emocion`).
5. La respuesta 5 es una acción concreta: guardar, enviárselo a alguien,
   comentar o escribirle a la cuenta. "Nada" nunca pasa. Si la acción no es la
   de la señal objetivo (`guardados` → guardar, `envios` → enviar, `comentarios`
   → comentar, `retencion` → verlo hasta el final y guardar o enviar, `dm` →
   escribirle por mensaje, desde 2026-11-02), **no bloquea**:
   regístralo como `NB` con la regla `completo P5: acción distinta a la señal`
   o `con prisa P5: acción distinta a la señal`. Con la cuenta chica y sin
   métricas, lo que el lector *cree* que haría vale menos que lo que mide el
   bucle; el desajuste queda anotado para compararlo con los datos reales
   (decisión del usuario, 2026-10-07).
6. La respuesta 6 no señala una **contradicción**, una **promesa** que la pieza
   no cumple, ni que **no pudo seguir los pasos** para obtener el entregable.
   Cualquier otra duda (quería más detalle, un ejemplo extra) no bloquea.
   Distingue querer otro ejemplo de que falte la parte que prueba la promesa:
   «Hola, entiendo tu molestia…» no demuestra cómo decir que no sin sonar duro;
   «plazo: marzo» sin decir para qué deja el resumen incompleto. Si la promesa
   depende de una transformación, el lector debe poder relacionar los datos de
   entrada, el pedido y el resultado, aunque estén repartidos entre escenas.
   No exige tres pantallas ni un antes/después en toda pieza: una explicación
   conceptual o una bitácora demuestra su idea o lección de otra forma. Estos
   casos precisan el criterio de promesa incumplida o paso imposible; no agregan
   una pregunta ni convierten todo pedido de más detalle en un bloqueo.
7. La respuesta 7 nombra un **resultado concreto** que coincide con el
   entregable declarado ("ordenar mis pendientes con ChatGPT", "narrar un video
   sin grabar mi voz"). "No sé", una pregunta, el tema a secas ("algo de
   hábitos") o una promesa vaga ("un truco", "mejorar mis textos") **no
   pasan**. Motivo: seguidores avisaron el 2026-10-15 que no se entiende el
   propósito de los reels; hooks como «¿Por qué tu texto se olvida?» nombran un
   problema sin decir qué te llevas, y con 3 s de visionado medio nadie llega
   a la respuesta. Desde el 2026-10-31 la 7 dice además **con qué** (la IA o
   la herramienta) o **cómo**: «tener el informe listo, pero no sé cómo ni con
   qué» no pasa. Un «no sé» en la 7 del lector con prisa bloquea en
   **cualquier** ronda: no se repite el lector hasta que pase; se cambia la
   portada (con el juez).
8. La respuesta 8 nombra algo que el lector aprendió. En el lector
   **completo** bloquea si responde "nada nuevo" (o "ya lo sabía") y también si
   nombra algo que la pieza no enseña (que no está en ninguna slide). La novedad
   se juzga desde el perfil principiante vigente: descubrir cómo aplicar la IA
   a una tarea cotidiana puede ser nuevo aunque sea básico para un experto.
   No atribuyas experiencia ni conocimientos que ese perfil no tiene. En el lector **con prisa** la 8 **no
   bloquea** (desde 2026-10-23): ve solo los títulos y en el backtest marcó
   "nada nuevo" en 9 de 20 piezas aunque el cuerpo trajera algo nuevo; se
   registra como `NB` con `con prisa P8: no bloquea`.

9. La respuesta 9 (desde el 2026-11-02, spec «piezas que se entienden»): contada
   de corrido, la pieza tiene que ser la de `fraseAmigo` y nombrar el primer paso
   del `guion` (el primero que el lector puede hacer) con su qué o su cómo
   («copio el mensaje y se lo pego a ChatGPT»). En el lector **completo** bloquea
   si cuenta otra idea, si no dice qué haría primero o si el primer paso queda sin
   qué ni cómo. En el lector **con prisa** no bloquea: regístralo como `NB` con
   `con prisa P9: no bloquea`.

- **Lector completo:** deben cumplirse las ocho (1–8), con la 3 y la 6 como
  están escritas arriba, y la 9.
- **Lector con prisa:** cuentan solo la 1, la 2, la 5 y la 7. La 7 nunca va
  como `NB`. Sus respuestas 3, 4, 6 y 8
  **no bloquean**. El lector con prisa no ve el cuerpo a propósito; echarlo de
  menos es esperable.

### Dudas no bloqueantes: cita textual obligatoria

Quien clasifica eres tú, que escribiste la pieza: por eso no basta con decidir
que una duda "no bloquea". Por **cada** duda que declares no bloqueante (del
lector completo o del con prisa) escribe en `lectorFrio.notas` una entrada con
la cita **textual** de la respuesta del lector y la regla que aplicas:

```
NB: «cita» → regla
```

Reglas que puedes citar (con dónde lo explica la pieza cuando corresponda):

- `completo P3: explicado en la pieza (slide N: …)`
- `completo P3: uso común (…)`
- `completo P6: no es contradicción, promesa incumplida ni paso imposible`
- `completo P5: acción distinta a la señal`, `con prisa P5: acción distinta a la señal`
- `con prisa P3: no bloquea`, `con prisa P4: no bloquea`, `con prisa P6: no bloquea`
- `con prisa P8: no bloquea` (también con "nada nuevo": anótalo igual, sirve
  al bucle). El lector completo no tiene escape en la 8.
- `con prisa P9: no bloquea`. El lector completo no tiene escape en la 9.

Una entrada por línea (o separadas por `; `). El validador rechaza un `NB` mal
escrito y cualquier "no bloquea" fuera de un `NB`. Si no puedes citar una regla
que la cubra, la duda bloquea: reescribe.

Si falla una condición que cuenta, en cualquiera de los dos lectores: reescribe la pieza
**entera desde el `guion`** (primero revisa el guion: cada escena es el paso siguiente de la
anterior; no cambies una frase suelta) contando la vuelta, y vuelve a correr **ambos** lectores
con subagentes nuevos. Tras dos fallas del lector, la vuelta siguiente **cambia de momento**
(en `lo-que-construi`, de ángulo): es una pieza nueva en el mismo hueco.
Tope: `puerta.reescriturasMax` vueltas en total, sumando las del validador.
Si no pasa, la pieza se quita y el hueco queda vacío.

Registra el resultado en `plan.json`, campo `lectorFrio` de la pieza:

```json
{ "intentos": 2, "resultado": "ok", "notas": "v1: el lector completo no entendió 'cuaderno' y no estaba explicado; se explicó en el Step 1.\nNB: «no dice cómo subo el archivo» → con prisa P3: no bloquea" }
```

`resultado` es exactamente `"ok"` solo si pasó; `notas` resume qué falló en
cada intento anterior y, como `NB: «cita» → regla`, cada duda que no bloqueó
(sirve para el bucle de feedback y como mejoras opcionales).
