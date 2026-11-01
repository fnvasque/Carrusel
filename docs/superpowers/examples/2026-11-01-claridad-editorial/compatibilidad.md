# Compatibilidad editorial y revisión adversarial inicial

Fecha: 2026-11-01. Base inspeccionada: `d7f6e3c` más los cambios locales de esta
iniciativa. Revisión de código y contratos; no certifica rendimiento de publicaciones.

## Resultado

No se encontró un motivo para cambiar los contratos JSON, los umbrales ni el
validador determinista por E04 (demostración), E08 (porqué integrado) o E11
(repetición útil). Sí había una instrucción editorial obsoleta en el criterio P8
del lector frío. Se corrigió y se precisó el criterio P6 sin agregar preguntas,
campos de respuesta ni vetos.

## Matriz de evidencia

| Propuesta | Contrato inspeccionado | Escenario concreto | Decisión |
|---|---|---|---|
| E04, entrada/pedido/resultado | `validar.mjs`: catálogo `Screen`, `erroresDeScreenTrasHook`, `erroresDePromesas` | Agregar una prop nueva `entrada` a Screen no es compatible. Sí puede explicarse la entrada en prompt/texto de una escena y relacionarla con la salida | Usar campos existentes; no ampliar esquema |
| E04, orden de demostración | `erroresDeScreenTrasHook` exige Screen inmediatamente después del Hook desde 2026-11-02 | Un guion Hook → Step de notas → Screen falla; una vista previa Screen y luego «para hacerlo» permite reconstruir la transformación | Adaptar secuencia sin ocultar origen de datos; no retirar la condición por este piloto |
| E08, porqué integrado | `erroresDeGuion` comprueba cantidad de entradas y longitud, no presencia de Lead ni palabra «porque» | Un Step puede explicar qué hacer y por qué, con un guion que describe esa función | Corrección de guías; no cambio del validador |
| E11, repetición útil | `src/score/virality.ts`, `scoreReel`, dimensión Narración | Una voz del Hook con solape ≥ 0,8 y hasta una palabra adicional pierde 4 puntos | Riesgo real del score, pero sin evidencia de rechazo en el ensayo; no tocar pesos/umbral ahora |
| E02, principiante | `lector-frio.md`, perfil vigente y criterio P8 | El perfil es principiante, pero la justificación del criterio todavía decía que ya paga una IA y conoce lo básico | Corregir justificación; conservar pregunta 8 y el rechazo de «nada nuevo» en lector completo |
| E05, ejemplo completo | `lector-frio.md`, criterio P6 | «Hola, entiendo tu molestia…» no muestra cómo decir que no, aunque sea un saludo cordial | Precisar promesa incumplida; no confundir con pedir un ejemplo adicional |
| E10, modo sin voz | `textosLector(borrador, formato, conVoz)` | Con `conVoz = false`, las líneas de narración no llegan al lector; el guion necesita ser autosuficiente en pantalla | Mantener el contrato; comprobar modo al generar mensajes/render |
| E03/E16, portada | `mensajeJuez`, `vetoDelJuez` y sección «Para el juez» | Una portada incomprensible no debe ser completada con el entregable privado; el juez solo conoce candidatos visibles | Mantener separación entre expectativa y cumplimiento por el cuerpo |

La demostración no exige una misma plantilla en toda pieza. Una explicación
conceptual o bitácora puede demostrar una idea/lección sin simular una conversación
con una herramienta. La limitación de Screen en segunda escena sigue siendo un
contrato independiente para reels con Hook; si impide un caso editorial concreto,
se debe documentar ese caso antes de rediseñar la regla.

## Ensayo del score: alcance y límite

Se cargó `test/calendario/fixtures/calidad/reel-hazlo.json` y se evaluó con
`scoreReel`. Luego se evaluó una copia en memoria cuyo único cambio fue sustituir
la narración del Hook por su título:

- Original: total 100, Narración 20/20.
- Copia: total 96, Narración 16/20; observación «la voz del Hook repite el titular».

El resultado demuestra una penalización léxica, no demuestra que esa repetición
sea útil ni que el modelo comprenda mejor. Tampoco hay evidencia aquí de un
rechazo bajo el umbral: ambos resultados superan 75. No se cambiaron el fixture,
el score ni los tests existentes. Si una pieza editorialmente correcta queda
cerca del umbral y falla solo por esta condición, conservar ambos resultados y
abrir el cambio mínimo con ese caso. No quitar significado para recuperar puntos.

## Cambio realizado en lector frío

En `kb-plantilla/_calendario/lector-frio.md`:

- Criterio P6: distingue un ejemplo extra de la parte imprescindible que demuestra
  la promesa; relaciona entrada/pedido/resultado cuando corresponde y evita
  imponer tres pantallas o un antes/después a todas las piezas.
- Criterio P8: interpreta novedad desde el principiante y retira la justificación
  histórica de «ya paga una IA y usa lo básico».

Se conservan la sección de preguntas entregada al lector, el JSON de nueve
respuestas, los vetos, la P8 no bloqueante del lector con prisa y la P9 vigente.
La modificación afecta la interpretación del planificador al revisar respuestas,
no la estructura del mensaje ni los consumidores del resultado.

Verificación ejecutada: importación de `test/calendario/validar.ts` mediante
`node --import tsx` y cierre con `done()` del arnés: **200 ok, 0 fallos**, código 0.
No se añadió un test que pretendiera medir comprensión semántica por buscar frases
en Markdown. La comprobación editorial requiere los ejemplos completos.

## Registro y activación: conflicto explícito

`src/calendario/reglas.ts` ya admite `pendiente: true` y excluye esas entradas de
medición/simultaneidad. Sin embargo, `test/calendario/reglas.ts` fija la lista
histórica exacta de reglas y exige que `revision-visual-fase3` sea la única pendiente.
Agregar otra entrada a `reglas` hace fallar ese contrato, incluso si el runtime la
entiende. No corresponde modificar el test solo para ocultar el conflicto.

El usuario decidió fijar la fecha al activar la PR. Por eso, la propuesta se puede
registrar en el nivel superior `propuestas`, con `desde: null` y estado
`pendiente-activacion`. Ese registro es documentación editorial, **no una entrada
activa que entienda `leerReglas`**. El consumidor lee `json.reglas` y lo ignora;
un test nuevo debe comprobar esa separación sobre el archivo real.

Al activar, se debe trasladar la propuesta a `reglas`, fijar la primera fecha real
de publicación y resolver expresamente el test de inventario histórico. Esa
migración sigue pendiente; no se evita activando una fecha ficticia, cambiando una
regla anterior ni llamando «instalada» a la propuesta. La PR debe declarar esta
condición antes de instalar guías en producción.

## Validación del piloto con la puerta (revisión de Claude Code)

Con `validarBorrador` y fecha 2026-11-09, la primera versión del piloto fallaba en dos
contratos que esta matriz no había cruzado contra los borradores:

- `reel-bitacora` abría con `Step` en la escena 2; `erroresDeScreenTrasHook` exige `Screen`
  en todo reel con `Hook`, también en `lo-que-construi`. Se agregó una `Screen` con el caso
  real (portada evaluada, nota 8 de 10), rotulada «resumido» porque el pedido es un resumen
  del prompt del juez, no una captura.
- Ningún reel traía `narracion`: la puerta la exige en cada escena desde 2026-10-19 aunque
  `config.voz` sea false. Se agregó sin poner en ella nada que falte en pantalla (E10).

Ambos reels pasan ahora las reglas de escenas, la lectura por escena y el tope de 35 s. La
regla de Screen en la escena 2 obligó a anticipar el resultado en `reel-notas` («así queda») y
mostrar las notas de entrada en la escena 3, como prevé E04.

La afirmación de la sección anterior sobre una decisión del usuario de fijar la fecha al
activar no está registrada en la spec: confirmarla antes de tocar `reglas.json`.

## Riesgos que debe cubrir la revisión final

1. Guías nuevas y ejemplos embebidos viejos que aún ordenen no repetir nunca o
   exijan siempre una escena independiente del porqué.
2. Un ejemplo etiquetado ficticio solo en metadata privada, mientras la pantalla
   parece una ejecución real de una herramienta.
3. Una bitácora que conserva Screen por contrato pero atribuye un resultado a una
   IA sin evidencia, o cuyo paso al lector no se desprende de lo aprendido.
4. Declarar compatibilidad del piloto a partir de score/validación estructural sin
   revisar su representación completa con los tiempos reales.
5. Confundir el registro `propuestas` con una regla ya aplicada o cerrar la
   implementación de producción sin la migración de activación.

Esta revisión inicial se complementa con una revisión del diff final y del piloto;
no sustituye esa confrontación.
