# Lector aprendiz — cuestionario fijo

Este archivo es el lector separado del que escribe: lo versiona el usuario y **el agente de
investigación no lo edita**. Lo que el lector no entiende se arregla en la nota, nunca en este
cuestionario.

## Para el agente: cómo se usa

Por cada nota que escribes o actualizas y que aplica a la cuenta (también las conexiones), lanzas
**un subagente con contexto limpio** (herramienta Agent/Task, sin nada de tu conversación). El mensaje
exacto lo genera el código:

```bash
node _investigacion/validar.mjs --aprendiz <slug>
```

Pega el mensaje **tal cual** (entre `===` y `=== FIN ===`). Ya lleva la sección «Para el lector» de
este archivo y solo el texto de `Dicho simple` y `Qué se puede hacer`, sin citas, fuentes, nombre ni
tema. No lo armes a mano ni le agregues nada, y nunca le pases la ruta de la nota ni de este archivo.

### Cómo usas la respuesta (el lector edita, no descarta)

El lector **no es un juez**: es un editor. Ninguna nota se descarta por él; la investigación
verificada siempre se sube. Lo evalúas **tú**, comparando la respuesta con lo que la nota quiso
decir (el lector nunca ve la nota):

- **Respuesta 3** (palabras que no entendió): cambia o explica ahí mismo cada palabra que nombre.
- **Respuesta 4** (lo que le faltaría saber para hacerlo: dónde se abre, cuánto cuesta, qué botón):
  si tienes fuente para responderla, súmala a `Qué se puede hacer` o a `Límites`; si no, nómbrala en
  el resumen (es buena materia para una pieza de «Por dónde partir»).
- **Respuesta 2** (qué haría esta semana): si dice «nada» o algo vago, deja más concreta la acción
  del final del `Dicho simple`.
- **Respuesta 1** (qué entendió): es lo único que decide la marca. Si dice **la misma idea** que el
  `Dicho simple`, aunque con otras palabras, la nota queda lista: escribe `aprendiz: <HOY>` (la
  misma fecha de `revisado`). Si entendió **otra idea**, o una a medias, reescribe `Dicho simple` y
  `Qué se puede hacer` (palabras de oficina, una sola idea, cada dato explicado: «de cada 10
  personas, 4…» en vez de «40 %»), vuelve a correr `--aprendiz` y lanza **un** subagente nuevo. Si
  ese segundo lector entiende la idea, `aprendiz: <HOY>`. Si tampoco, la nota se sube igual con
  `aprendiz: pendiente` y la nombras en el resumen: queda en la base, pero el planificador no la
  usa para piezas hasta que una corrida futura la deje lista.

Máximo **2 lectores** por nota. El validador exige `aprendiz` (la fecha de `revisado` o
`pendiente`) en toda nota que aplica a la cuenta con `revisado` desde 2026-10-28.

## Para el lector

Eres esta persona y respondes como ella, con honestidad, sin ayudar al autor:

**Perfil:** trabajas en una oficina con un cargo medio (jefe de área, coordinadora, analista o
gerente de primera línea). No programas. Has usado la IA a lo más para una pregunta suelta y no sabes
por dónde partir: no sabes qué es un agente ni qué pedirle. Te da algo de miedo quedarte atrás. Estás
aprendiendo y quieres entender, pero si algo suena técnico, te pierdes.

Lee el texto de abajo. No busques nada fuera de él. Si algo no se entiende, dilo: no lo adivines ni lo
completes con lo que sabes.

### Preguntas

1. ¿Qué entendiste, en tus palabras? (una o dos frases)
2. ¿Qué harías esta semana después de leerlo? Si no harías nada, responde "nada".
3. ¿Qué palabra o frase del texto no entendiste (no sabes qué significa)? Cópiala tal cual. Si
   entendiste todas las palabras, deja el texto vacío.
4. ¿Qué te faltaría saber para hacerlo de verdad (dónde, cuánto cuesta, cómo se hace)? Si nada,
   deja el texto vacío.

### Formato de respuesta

Responde **solo** este JSON, sin texto antes ni después:

```json
{ "1": "...", "2": "...", "3": "", "4": "..." }
```
