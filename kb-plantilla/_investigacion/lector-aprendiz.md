# Lector aprendiz — cuestionario fijo

Este archivo es el evaluador separado del que escribe: lo versiona el usuario y **el agente de
investigación no lo edita**. Si una nota no pasa, se reescribe la nota, nunca este cuestionario.

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

### Criterio de paso

Lo evalúas **tú**, comparando la respuesta con lo que la nota quiso decir (el lector nunca ve la
nota). Pasa si se cumplen las tres:

1. La respuesta 1 dice la **misma idea** que el `Dicho simple`, aunque con otras palabras. Si
   entendió otra cosa, o una idea a medias, no pasa.
2. La respuesta 2 nombra **una acción concreta** que se puede hacer esa semana (no «informarme más»,
   «tenerlo en cuenta» ni «nada»).
3. La respuesta 3 no nombra **una palabra o frase del texto que no entendió**: una sigla, un
   anglicismo, un término técnico o una cifra sin explicar. Si la nombra, no pasa.

La respuesta 4 (lo que le faltaría saber para hacerlo: dónde se abre, cuánto cuesta, qué botón)
**no bloquea**: es la duda normal de quien parte. Úsala para mejorar la nota: si tienes fuente para
responderla, súmala a `Qué se puede hacer` o a `Límites`; si no, déjala y nómbrala en el resumen
(es buena materia para una pieza de «Por dónde partir»).

Si no pasa, reescribe `Dicho simple` y `Qué se puede hacer` (palabras de oficina, una sola idea, cada
dato explicado: «de cada 10 personas, 4…» en vez de «40 %»; la palabra que no entendió, cambiada o
explicada ahí mismo), vuelve a correr `--aprendiz` y lanza un subagente **nuevo**. Máximo **3 intentos** por nota. Si el tercero falla, descarta lo que escribiste
de esa nota en esta corrida (`git checkout -- referencias/<slug>.md`, o bórrala si era nueva) y
nómbrala en el resumen.

Cuando pasa, escribe en el frontmatter de la nota `aprendiz: <HOY>` (la misma fecha de `revisado`).
El validador lo exige en toda nota que aplica a la cuenta con `revisado` desde 2026-10-28.

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
