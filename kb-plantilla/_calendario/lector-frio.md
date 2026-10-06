# Lector frío — cuestionario fijo

Este archivo es el evaluador separado del que escribe: lo versiona el usuario y
**el planificador no lo edita**. Si una pieza no pasa, se reescribe la pieza,
nunca este cuestionario.

## Para el planificador: cómo se usa

Por cada pieza lanzas **dos subagentes con contexto limpio** (sin nada de tu
conversación). A cada uno le pasas **solo** este archivo y el texto que le toca:

| Lector | Qué recibe |
|---|---|
| **Completo** | El texto visible de todas las slides, en orden, slide por slide (`Slide 1: …`, `Slide 2: …`): títulos, `highlight`, cuerpo, bullets, prompt, mito/realidad, dato, CTA. |
| **Con prisa** | Solo el título y el `highlight` de cada slide, en orden. Nada más. Título = `title` o `heading`; en las slides sin título, su texto principal: `Lead` → `text`, `Stat` → `value` + `label`, `MythReality` → `myth`. |

**Prohibido** pasarle al lector: el tema, las fuentes o fichas, el plan, el
caption, el id, la señal objetivo, el entregable, la frase de amigo ni la
emoción buscada. Tampoco le digas qué esperas que responda. Si recibe algo de
eso, la prueba no vale y se repite.

El mensaje al subagente es exactamente: «Lee `lector-frio.md` (sección "Para el
lector") y responde sobre este texto:» seguido del texto.

## Para el lector

Eres este perfil y respondes como él, con honestidad, sin ayudar al autor:

**Perfil completo:** Hispanohablante de 25 a 45 años, curioso de la IA, **no técnico**, viendo esto en el celular, distraído, con el pulgar listo para pasar.

**Perfil "con prisa":** el mismo hispanohablante de 25 a 45 años, curioso de la
IA, no técnico, en el celular y distraído, pero con más prisa todavía: solo
alcanza a leer los títulos y la palabra destacada de cada slide antes de pasar.
Recibe solo títulos y `highlight`.

No busques nada fuera del texto. Si algo no se entiende, dilo: no lo adivines
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
`plan.json` para esa pieza (el lector nunca ve lo declarado). La pieza pasa
solo si se cumplen las seis condiciones **en ambos lectores**:

1. La respuesta 1 coincide con el tema de la pieza.
2. La respuesta 2 nombra el entregable (lo que se lleva el espectador).
3. La respuesta 3 está vacía o solo cita el término técnico permitido (máximo
   `puerta.terminosTecnicosMax`, explicado al vuelo).
4. La respuesta 4 es compatible con la emoción declarada (`emocion`).
5. La respuesta 5 coincide con la señal objetivo (`guardados` → guardar,
   `envios` → enviárselo a alguien, `comentarios` → comentar, `retencion` →
   verlo hasta el final y guardar o enviar; "nada" nunca pasa).
6. La respuesta 6 está vacía.

Si falla cualquiera en cualquiera de los dos lectores: reescribe la pieza
(contando la vuelta) y vuelve a correr **ambos** lectores con subagentes nuevos.
Tope: `puerta.reescriturasMax` vueltas en total, sumando las del validador.
Si no pasa, la pieza se quita y el hueco queda vacío.

Registra el resultado en `plan.json`, campo `lectorFrio` de la pieza:

```json
{ "intentos": 2, "resultado": "ok", "notas": "v1: el lector con prisa no vio el prompt; se movió al título" }
```

`resultado` es exactamente `"ok"` solo si pasó; `notas` resume qué falló en
cada intento anterior (sirve para el bucle de feedback).
