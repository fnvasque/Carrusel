# Claridad e interés — plan de mejoras y verificación

Fecha: 2026-11-01. Estado: **F1, F3 y F4 hechos en plantilla y piloto; F2 (revisión del
usuario) pendiente; nada instalado en la base ni publicado**. Ver «Estado de esta entrega».

Memoria y decisiones: [especificación editorial](../specs/2026-11-01-claridad-editorial-design.md).
Rama de preparación: `claude/plan-claridad-editorial`.
Base observada: `d7f6e3c` (merge de PR #78). Revalidar estado al retomar.

## Objetivo y definición de terminado

Que un lector principiante reconozca una situación de su trabajo, comprenda lo que la pieza
promete, vea una demostración suficiente y sepa cómo dar el primer paso. El interés se evalúa
por separado; no prometer eliminar todos los errores ni garantizar alcance.

**Este encargo de planificación termina con:** spec y plan guardados, decisiones/pendientes
distinguibles, rutas y referencias comprobadas, `git diff --check`,
`npm run typecheck && npm test` en 0. No requiere generar medios, llamar APIs, instalar reglas
ni publicar. Los tests verifican el estado del proyecto; no certifican la calidad editorial.

**La futura mejora editorial termina con:** guías coherentes, piloto revisado en ambos formatos,
defectos críticos resueltos, ejemplos trazables y evidencia de legibilidad del artefacto real;
además, comandos del proyecto en 0. Una adaptación del juez/validador requiere cierre propio.

## Restricciones y forma de retomar

- Trabajar en rama `claude/<tema>`. No push a `main`, `--force` ni merge por el agente.
- Cambios ajenos detectados al iniciar: directorios `entregables/`, `private/`, `reports/`,
  `research_notes/` e informes no versionados. No agregarlos a commits de esta iniciativa.
- Documentación e implementación pertenecen al repo Carrusel. `knowledge/` se consulta solo
  como evidencia; no modificarlo ni usar el instalador desde este trabajo.
- No editar `render.json`, borrar cachés ni instalar Chromium. No generar recursos pagados
  para evaluar una corrección de texto.
- No editar/borrar tests para hacerlos pasar. Si un contrato anterior contradice una decisión
  nueva, documentar la contradicción y acordar la migración; no esconderla.
- Conservar las decisiones previas citadas en la spec. E01–E18 son propuestas, no aprobación
  implícita de un cambio de producción. Un plan histórico tampoco autoriza operaciones actuales.
- No declarar una fecha `desde` hasta identificar la primera publicación real con la mejora.

## Orden de ejecución y dependencias

`F0 inventario → F1 piloto escrito → F2 revisión editorial → F3 guías → F4 compatibilidad`

Desde F4: si hay conflicto comprobado, diseñar F5; si no, omitir F5.
Luego `F6 render y pruebas → F7 entrega/activación → F8 seguimiento`.

Los borradores del piloto permanecen aislados hasta completar compatibilidad y pruebas. No
activar guías nuevas que pidan algo que la puerta vigente impida sin resolver el conflicto.
La escritura puede avanzar antes de conocer umbrales, pero la publicación no salta controles.

## F0 — Inventario y memoria

Entregable: inventario breve con fecha y revisión base. Sin cambios operativos.

- [x] Leer guías y cuatro borradores del 2026-11-02, incluyendo captions.
- [x] Consultar specs previas de portada y piezas que se entienden.
- [x] Guardar diagnóstico, E01–E18 y P01–P07 en la spec asociada.
- [x] Localizar interfaces de juez/lector y comportamiento del instalador, sin ejecutarlo.
- [ ] Al iniciar implementación, comparar de nuevo plantilla/base y detectar cambios desde este diagnóstico.
- [ ] Confirmar modo de voz y subtítulos para el piloto y qué ayuda real ofrece PARTIR (P02/P03).
- [ ] Inventariar instrucciones duplicadas por asunto: audiencia, portada, hilo, voz, demostración,
  explicación, cierre. Registrar «conservar / sustituir / archivar» y fuente vigente.

Salida: ninguna decisión previa se pierde y cada contradicción tiene ubicación y resolución propuesta.

## F1 — Construir un piloto editorial aislado

Ubicación propuesta: `docs/superpowers/examples/2026-11-01-claridad-editorial/` (crear al ejecutar).
No sobrescribir los cuatro borradores de la base. Guardar texto original relevante, propuesta,
IDs E aplicados y notas de evidencia. No usar el nombre del ejemplo como fecha de publicación.

- [x] Reel A (`reel-notas.json`): notas de reunión → acuerdos. Enseñar de dónde salen responsables y fechas;
  ajustar «acta lista» al alcance real, mostrar revisión y variante con dato ausente.
- [x] Carrusel B (`carrusel-reclamo.json`): respuesta a reclamo. Mostrar la negativa cordial completa y revisión de
  compromisos; mantener el mismo cliente y fecha durante todas las láminas.
- [x] Carrusel C (`carrusel-estilo.json`): correo con tu estilo. Referencia y salida comparables, hechos constantes;
  distinguir tono de información faltante.
- [x] Reel D (`reel-bitacora.json`): caso de bitácora con evidencia: las dos portadas con nota 8
  del juez que el usuario rechazó (spec `2026-10-30-portada-al-lector-design.md`). La `Screen`
  resume el pedido real al juez y lo rotula «resumido».
- [ ] Escribir una ficha editorial por caso con las ocho preguntas de la spec, sin ampliar aún
  el esquema `plan.json`. (Hoy solo está el `angle` de cada borrador.)
- [x] Marcar todo dato ficticio o salida ilustrativa. Identificar hechos que requieren fuente.
- [ ] Verificar capacidades y condiciones vigentes con fuentes primarias antes de afirmar
  nombres, disponibilidad, gratuidad, costos o instrucciones de interfaz.
- [ ] Preparar portada al final, con alternativas que cambien la entrada al tema y una promesa
  demostrable. No optimizar por palabras que dan puntos.
- [ ] Preparar caption completo si se ofrece copiar un pedido; distinguir texto reemplazable.

Salida: cada ejemplo demuestra la habilidad prometida y tiene un hilo reconstruible. Son
guiones candidatos, todavía no publicaciones ni resultados garantizados de una herramienta.

## F2 — Revisión editorial y aprobación de criterios

Aplicar la tabla de ocho dimensiones de la spec. Primero revisar sin el plan privado a la vista;
después contrastar promesa, demostración y fuentes. Registrar dudas literales, sin deducir que
una ausencia de preguntas implica comprensión.

- [ ] Revisar cada caso completo y por títulos. El hojeo necesita transmitir la idea y el
  beneficio, no cada detalle que solo existe en el cuerpo.
- [ ] Identificar por caso el primer paso, el dato que aporta la persona, la transformación y
  el criterio de revisión. Para bitácora, identificar decisión, resultado y lección.
- [ ] Pedir al usuario revisión de ejemplos concretos y resolver E11 (repetición útil), E08
  (porqué integrado) y las demás propuestas que cambien instrucciones vigentes.
- [ ] Registrar correcciones como contexto, propósito, hilo, demostración, promesa, lenguaje,
  interés o cierre en la evidencia local. Estos son rótulos editoriales del piloto, no nuevos
  IDs de `lector-causas.ts` todavía.
- [ ] Reescribir desde el guion cuando falle el hilo; volver a revisar la pieza completa para
  detectar contradicciones introducidas por un arreglo local.
- [ ] Cerrar P02/P07 o excluir temporalmente los ejemplos dependientes, dejando el motivo.

Salida: no quedan defectos críticos editoriales en los ejemplos aceptados. El usuario puede
ver qué propone cada criterio, sin aprobar reglas abstractas a ciegas. Interés incierto queda
registrado para el piloto real, no transformado en una afirmación de éxito.

## F3 — Consolidar las guías, sustituyendo contradicciones

Cambios futuros en `kb-plantilla/_calendario/`; todavía no se instalan en la base.

| Archivo | Trabajo concreto | Cuidado de integración |
|---|---|---|
| `guia-redaccion.md` | Integrar E01–E14 y E17–E18 con ejemplos aceptados; diferenciar claridad de recorte; explicar entrada/salida, voz, bitácora y carrusel | Sustituir «nunca repite» solo si E11 se acepta; no garantizar salidas exactas ni quitar revisión humana |
| `guia-hooks.md` | Resolver el ejemplo simultáneamente bueno/malo; retirar audiencia experta de instrucciones vigentes; patrones útiles para principiantes | Reservar «Para el juez» para F5 si necesita cambios; no colar un cambio operativo del juez en esta fase |
| `INSTRUCCIONES.md` | Un flujo canónico: situación/resultado → ejemplo/evidencia → guion → texto → plantilla → portada → revisión | Reutilizar campos actuales; ejemplos embebidos coherentes y completos; no duplicar todas las guías |
| `momentos.md` | Consultar cobertura de situaciones/capacidades | Propiedad del usuario: no modificar el banco para acomodar el piloto |
| `lector-frio.md` | Comparar criterios actuales con revisión propuesta | Mantenerlo sin cambios hasta F5; la autoría de guías no autoriza cambiar el cuestionario |
| Specs anteriores | Consultar decisiones/historia | No reescribirlas retroactivamente; registrar en nueva spec qué se reemplaza |

- [ ] Hacer búsqueda completa de instrucciones y ejemplos contradictorios, no solo el primer párrafo.
- [ ] Corregir también checklist y ejemplos de `plan.json`/borradores incrustados donde corresponda.
- [ ] Separar ejemplos históricos de ejemplos normativos para que el planificador no copie lo retirado.
- [ ] Verificar que no se añadió una prohibición general de primera persona, preguntas, repetición,
  subtítulos o ejemplos sencillos. Las decisiones dependen de su función.
- [ ] Mantener las secciones «Para el juez»/«Para el lector» intactas en esta fase y comprobarlo en el diff.

Salida: una sola indicación vigente por asunto. Toda propuesta incorporada referencia su ID y
ejemplo aceptado; cualquier instrucción que dependa de un evaluador incompatible queda sin activar.

## F4 — Diagnóstico de compatibilidad con la puerta vigente

Esta fase abre el análisis del validador/juez que se dejó fuera de la revisión inicial. Se
ejecuta después de contar con ejemplos editoriales acordados; no implica modificarlos aún.

- [ ] Traducir guiones a fixtures temporales y conservar una copia editorial legible.
- [ ] Aplicar validación local con configuración y fecha explícitas, sin escribir en la base
  ni lanzar publicación. Registrar versión, comando y salida resumida por caso.
- [ ] Inspeccionar texto que reciben juez y lectores frente a lo visible; diferenciar una
  función que genera un prompt de una evaluación real por un modelo.
- [ ] Clasificar cada discrepancia: error de pieza, requisito objetivo vigente, extracción
  incorrecta, juicio semántico o regla incompatible con criterio editorial aprobado.
- [ ] No cambiar umbrales/topes para acomodar un ejemplo aislado ni reescribir en telegramas
  una buena pieza para obtener una nota. Reducir alcance editorial si es la solución adecuada.
- [ ] Crear tabla de impacto E → componente → caso reproducible → cambio mínimo → riesgo → prueba.

Salida: informe concreto que diga qué necesita cambiar y qué puede conservarse. Si la puerta
ya permite las mejoras, F5 se omite y se deja constancia. Si el bloqueo es diseño/timing,
proponer trabajo separado; no ensanchar esta iniciativa silenciosamente.

## F5 — Adaptación condicional de juez/lector/validador

**No iniciada, sin diseño de contratos cerrado.** Antes de ejecutar, completar la matriz de F4
y registrar las nuevas decisiones en la spec. Cambios a preguntas, notas, vetos y vigencia son
decisiones nuevas, no una consecuencia automática de E01–E18.

Posibles archivos, solo si evidencia los implica:

- `kb-plantilla/_calendario/guia-hooks.md`: sección «Para el juez».
- `kb-plantilla/_calendario/lector-frio.md`: preguntas, perfiles y criterios, respetando su propiedad.
- `kb-plantilla/_calendario/validar.mjs`: `mensajeJuez`, `vetoDelJuez`, `mensajeLector`,
  `textosLector` y controles objetivos pertinentes.
- `kb-plantilla/_calendario/validar.d.mts`: únicamente si cambian exports/contratos.
- `src/calendario/lector-causas.ts`: si cambian causas o formato de fallos, con trazabilidad.
- `src/calendario/reglas.ts`: solo si cambia el contrato de registro; agregar una regla no
  implica por sí mismo cambiar este código.
- Tests pertinentes: `test/calendario/validar.ts`, `entender.ts`, `lector-causas.ts`, `reglas.ts`
  y los que cubran contratos descubiertos. No ampliar el score léxico como efecto colateral.

Tareas obligatorias si se ejecuta:

- [ ] Definir esquema/versiones, fecha de aplicación y compatibilidad con semanas anteriores.
- [ ] Diseñar casos buenos y malos emparejados antes de modificar el evaluador.
- [ ] Preservar entradas limpias: el juez no recibe entregable/tema privado para completar el título.
- [ ] Mantener diferenciados expectativa de portada y cumplimiento por la pieza completa.
- [ ] Verificar que el validador no intenta medir semántica por una palabra, cantidad de campos
  o frase ritual como «porque».
- [ ] Si cambia un formato de respuesta, actualizar productores/consumidores y cubrir resultados
  antiguos, campos ausentes, JSON inválido y errores legibles.
- [ ] No confundir tests del contrato del prompt con pruebas de calidad del juicio del modelo.
- [ ] Comparar evaluaciones antes/después sobre corpus fijo, registrar falsos positivos y
  negativos, desacuerdos con el usuario y variabilidad. Mantener presupuesto de evaluaciones
  explícito antes de ejecutar llamadas con costo; no reintentar hasta conseguir una aprobación.
- [ ] Solicitar revisión independiente antes del merge cuando el cambio afecte publicación,
  dinero o controles de riesgo según AGENTS.md; para cambios de puerta, mantener también la
  práctica de revisión independiente documentada en la spec de 2026-10-31.

Salida: mejora demostrada en los fallos objetivo sin rechazar los contraejemplos correctos.
Un solo aumento de nota no es evidencia suficiente.

## F6 — Matriz de aceptación y pruebas

Estos son escenarios de revisión; solo los que tengan un contrato determinista deben volverse
tests automatizados. Los semánticos son casos del corpus editorial con juicio y evidencia.

| Caso | Resultado esperado | Tipo de verificación |
|---|---|---|
| Lista de acuerdos con entrada y responsables visibles | Se entiende la transformación | Editorial |
| Misma lista sin datos de entrada | Se detecta origen no demostrado | Editorial |
| Notas sin responsable, salida con «no indicado» | No se inventa quién lo hará | Editorial/evidencia |
| Rechazo cordial completo | Se ve cómo negar sin sonar duro | Editorial |
| «Hola, entiendo…» sin la negativa | Se detecta promesa no demostrada | Editorial |
| Resumen con «plazo: marzo» sin referente | Se detecta ambigüedad | Editorial |
| Pedido/resultado completos, pero situaciones distintas | Se detecta ruptura del caso | Editorial |
| Ejemplo ficticio rotulado | No se atribuye a ejecución real | Evidencia |
| Ejemplo ficticio presentado como captura real | Se detecta atribución falsa | Evidencia |
| Tutorial elemental útil para un principiante | No se rechaza por falta de sofisticación | Corpus de evaluación |
| Reel sin voz con instrucciones solo en narración | Se detecta información inaccesible | Extracción + render |
| Reel con repetición breve que orienta | No se penaliza automáticamente si E11 se acepta | Corpus de evaluación |
| Carrusel explicativo sin transformación de una app | Se admite si demuestra su idea | Editorial |
| Bitácora con decisión, resultado y lección | No se fuerza a convertirse en tutorial | Editorial |
| Voz personal sin consecuencia para el lector | Se señala desconexión | Editorial |
| Texto «para copiar» sin acceso real al pedido | Se detecta entregable incompleto | Artefacto/caption |
| Título incomprensible salvado por información privada | Juez/lector no lo completan | Entradas + corpus |
| Portada atractiva con cuerpo que no cumple | Fallo de cumplimiento aunque la portada interese | Editorial |
| Antiguo plan/resultado de juez | Mantiene el comportamiento histórico definido | Test de compatibilidad si F5 cambia contratos |
| «porque» presente, explicación vacía | No se considera prueba suficiente | Editorial |

Comandos de cierre de implementación:

```sh
git diff --check
npm run typecheck && npm test
node kb-plantilla/_calendario/validar.mjs --self-test
```

- [ ] Ejecutar `--self-test` si se modifican guías operativas/ejemplos o el validador.
- [ ] Si se tocan render/reels/medios, ejecutar también `npm run test:reel` con Chromium existente
  y ffmpeg disponible. No descargar Chromium para resolver un problema de texto.
- [ ] `npm run meta:check` solo si se toca publicación Meta/Instagram, fuera del alcance previsto.
- [ ] Renderizar los ejemplos del piloto en ubicación aislada usando el flujo del proyecto,
  previa inspección de efectos/costos del comando; no asumir que un CLI de calendario solo renderiza.
- [ ] Revisar cada lámina y el reel completo con tiempos reales: texto legible, orden, cortes,
  voz/subtítulos disponibles, contraste y pedido accesible. No escribir `render.json` a mano.
- [ ] Registrar qué pasó, qué faltó y dónde está la evidencia. Si el render no se puede realizar,
  no declarar el piloto listo para publicar.

## F7 — Entrega, registro de aplicación y activación separada

- [ ] Preparar diff revisable y PR de la implementación en rama `claude/`; merge a cargo del usuario.
- [ ] Si la PR aplica una regla del planificador/cambia la puerta, agregar entrada en
  `kb-plantilla/_calendario/reglas.json` con `id`, `desde` (primera publicación acordada),
  `formato`, `descripcion`, `fuente`. Si los formatos se activan en fechas distintas, registrar
  entradas separadas para no falsear el antes/después. Esta PR documental no aplica reglas.
- [ ] Mantener diferenciadas fecha de decisión, fecha de código y fecha de primera publicación.
- [ ] Definir traspaso al repositorio de la base por su flujo autorizado. Inspeccionar scripts:
  `scripts/kb-calendario-install.sh` copia archivos, hace commit y push; **no es una vista previa**.
  No ejecutarlo desde Carrusel para modificar `knowledge/` bajo las restricciones actuales.
- [ ] Verificar allí versiones instaladas y conservar configuración del usuario. Si hace falta
  una nueva clave, diseñar migración explícita y valor por defecto, sin copiar config de plantilla.
- [ ] Activar solo en la semana decidida; no regenerar ni publicar automáticamente borradores
  ya programados como parte de una actualización editorial.
- [ ] Definir reversión por commit/versión anterior mediante el mismo flujo de revisión, sin
  `--force`, sin borrar historial ni cachés. Detener nuevas generaciones con la regla fallida
  según el mecanismo operativo autorizado; no borrar publicaciones ni reavisar piezas BORRADAS.

Salida: reglas y producción corresponden a la misma versión, con fecha comprobable y forma
de revertir. Terminar F6 no significa que F7 ya esté hecho.

## F8 — Seguimiento y mantenimiento de memoria

- [ ] Medir correcciones del usuario por pieza y por causa antes/después, con denominador y
  tamaño de muestra. Los cuatro ejemplos de este diagnóstico no representan toda la cuenta.
- [ ] Separar comprensión del rendimiento: en reels observar tiempo de visionado disponible;
  en carruseles señales disponibles como guardados/envíos; registrar PARTIR si puede atribuirse.
  No inferir lectura completa de métricas que no la midan.
- [ ] Comparar formatos por separado, ventanas de observación equivalentes y cambios de mix,
  frecuencia/tema/voz anotados. Pocas piezas o cambios simultáneos no prueban causalidad.
- [ ] Comparar también versiones de juez/lector si se cambiaron: una menor tasa de rechazo
  puede deberse al evaluador, no a mejor escritura.
- [ ] Registrar ajustes de E01–E18 con fecha, motivo, evidencia y efecto en evaluadores.
- [ ] Retirar ejemplos obsoletos del material operativo, conservando la historia en specs.

## Estado de esta entrega

Actualizado 2026-11-01 (tarde). La ejecución empezó en Codex y siguió en Claude Code.

**Hecho:**

- F1: cuatro borradores del piloto en `docs/superpowers/examples/2026-11-01-claridad-editorial/`,
  todos con «Ejemplo ficticio» visible salvo la bitácora, que es un caso real resumido.
- F3: `guia-redaccion.md`, `guia-hooks.md` e `INSTRUCCIONES.md` de `kb-plantilla/_calendario/`
  reescritas con E01–E18. Las secciones «Para el juez» y «Para el lector» quedaron idénticas
  (comprobado con diff de la sección).
- F4: `compatibilidad.md` con la matriz E → contrato → decisión. Conclusión: no hace falta F5
  por ahora; no se cambian umbrales, esquema ni validador.
- F6 (parcial): `render-piloto.ts` valida y renderiza las láminas sin voz, fondos, clips ni APIs.
  Las cuatro piezas pasan las reglas de escenas del validador real (fecha 2026-11-09) y la
  revisión visual automática sin hallazgos; reels de 34,4 s y 34,8 s (tope 35). Informe en
  `revision-render.json`. Se renderiza con
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=<chromium_headless_shell ya instalado>` porque la versión de
  Playwright no coincide con el navegador de la caché; no se ejecutó `playwright install`.

**Correcciones de Claude Code sobre lo que dejó Codex:**

- `INSTRUCCIONES.md` había quitado la regla «≤ 7 palabras en el Hook / 5 / 10» del ritmo `gancho`
  y la llamaba «aproximación». El validador la exige y `npm test` fallaba. Se restauró, aclarando
  que es un tope y no una meta; `guia-redaccion.md` decía lo mismo y también se corrigió.
- Dos referencias de `INSTRUCCIONES.md` apuntaban a secciones de la guía que ya no existen.
- `reel-bitacora` no tenía la `Screen` obligatoria en la escena 2 y ningún reel tenía `narracion`
  (la puerta la exige aunque `config.voz` sea false). `reel-notas` mostraba un solo dato y no la
  variante con dato ausente. Los CTA de los reels no seguían «Escribe esta palabra y te ayudo».
- Se aparta del plan: `lector-frio.md` cambió los criterios P6 y P8 (no la sección «Para el
  lector»). El plan pedía no tocarlo hasta F5. Se conserva porque P8 contradecía el perfil vigente
  (principiante), pero **requiere aprobación del usuario** en F2.

**Pendiente:**

- ~~F2~~ Cerrada el 2026-11-01: el usuario revisó el piloto («está mucho mejor») y aprobó
  activar desde el 8 de noviembre. Con eso quedan aceptados E01–E18 tal como están en las guías,
  incluidos E08, E11 y el cambio de P6/P8 en `lector-frio.md`.
- F7: registrada `claridad-editorial` en `reglas.json` con `desde: 2026-11-09` (el planificador
  del domingo 8 ya escribe con las guías; las primeras piezas salen el lunes 9). Para que rija,
  hay que instalar la plantilla en la base **antes del domingo 8 a las 06:00**, después del merge.
  Coincide con `titulo-hasta-14-palabras` y `juez-umbral-6`, también desde el 2026-11-09: el bucle
  las verá como simultáneas y no podrá atribuir el efecto a una sola.
- F0: inventario de duplicados; P02 (qué ayuda real ofrece PARTIR); fichas editoriales por caso.
- F6: render del reel completo en video (`--video`) y revisión con tiempos reales.
- La propuesta de `compatibilidad.md` de un registro `propuestas` con `desde: null` ya no hace
  falta: la fecha quedó decidida y la regla va directo a `reglas`.
- F8: seguimiento desde el 2026-11-09 (retención en reels; guardados, envíos y PARTIR en
  carruseles; correcciones a mano por semana).

Verificación: `npm run typecheck`, `npm test` (712 + 42 ok), `git diff --check` y
`node kb-plantilla/_calendario/validar.mjs --self-test`, todos en 0.
