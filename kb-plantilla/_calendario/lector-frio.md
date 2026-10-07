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
| **Completo** | Todo el texto que dibuja cada slide: títulos, `highlight`, `eyebrow`, `kicker`, `subtitle`, "Desliza →" (solo carrusel), número de paso, cuerpo, bullets, la ventana del prompt ("Copia este prompt", "Copiar") y el prompt, `note`, mito y realidad con sus etiquetas, dato, `reason`, la pastilla del CTA (sin emoji) y `@handle`. |
| **Con prisa** | Lo que se ve de un vistazo: el título de cada slide (`title`, `heading` o `text` según la plantilla) con su `highlight`; el número de paso; en `Prompt`, el texto copiable completo (`prompt`); en `MythReality`, mito y realidad con sus etiquetas ("El mito", "La realidad" o `mythLabel`/`realityLabel`); en `Stat`, el valor más su `label`. |

En ambos, `source` (la cita al pie) **no** entra y el número de paso **sí**. La
palabra destacada (`highlight`) va entre `**` dentro del título.

**Prohibido** pasarle al lector: el tema, las fuentes o fichas, el plan, el
caption, el id, la señal objetivo, el entregable, la frase de amigo ni la
emoción buscada. Tampoco le digas qué esperas que responda. Si recibe algo de
eso, la prueba no vale y se repite.

## Para el lector

Eres este perfil y respondes como él, con honestidad, sin ayudar al autor:

**Perfil completo:** Hispanohablante de 25 a 45 años, curioso de la IA, **no técnico**, viendo esto en el celular, distraído, con el pulgar listo para pasar.

**Perfil "con prisa":** el mismo hispanohablante de 25 a 45 años, curioso de la
IA, no técnico, en el celular y distraído, pero con más prisa todavía: solo
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

### Formato de respuesta

Responde **solo** este JSON, sin texto antes ni después. Si en la 3 o la 6 no
hay nada, deja el texto vacío (`""`).

```json
{ "1": "...", "2": "...", "3": "...", "4": "...", "5": "...", "6": "..." }
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
5. La respuesta 5 coincide con la señal objetivo (`guardados` → guardar,
   `envios` → enviárselo a alguien, `comentarios` → comentar, `retencion` →
   verlo hasta el final y guardar o enviar; "nada" nunca pasa).
6. La respuesta 6 no señala una **contradicción**, una **promesa** que la pieza
   no cumple, ni que **no pudo seguir los pasos** para obtener el entregable.
   Cualquier otra duda (quería más detalle, un ejemplo extra) no bloquea.

- **Lector completo:** deben cumplirse las seis (1–6), con la 3 y la 6 como
  están escritas arriba.
- **Lector con prisa:** cuentan solo la 1, la 2 y la 5. Sus respuestas 3, 4 y 6
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
- `con prisa P3: no bloquea`, `con prisa P4: no bloquea`, `con prisa P6: no bloquea`

Una entrada por línea (o separadas por `; `). El validador rechaza un `NB` mal
escrito y cualquier "no bloquea" fuera de un `NB`. Si no puedes citar una regla
que la cubra, la duda bloquea: reescribe.

Si falla una condición que cuenta, en cualquiera de los dos lectores: reescribe la pieza
(contando la vuelta) y vuelve a correr **ambos** lectores con subagentes nuevos.
Tope: `puerta.reescriturasMax` vueltas en total, sumando las del validador.
Si no pasa, la pieza se quita y el hueco queda vacío.

Registra el resultado en `plan.json`, campo `lectorFrio` de la pieza:

```json
{ "intentos": 2, "resultado": "ok", "notas": "v1: el lector completo no entendió 'cuaderno' y no estaba explicado; se explicó en el Step 1.\nNB: «no dice cómo subo el archivo» → con prisa P3: no bloquea" }
```

`resultado` es exactamente `"ok"` solo si pasó; `notas` resume qué falló en
cada intento anterior y, como `NB: «cita» → regla`, cada duda que no bloqueó
(sirve para el bucle de feedback y como mejoras opcionales).
