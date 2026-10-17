# Plan de pivote @ia.punto.es — 2026-10-17

## 1. Diagnóstico con los datos reales (no con intuición)

Fuente: `_metricas/cuenta.json`, `_metricas/posts.json`, `_calendario/aprendizajes.md`, perfil público, renders en `Carrusel-render/output/calendario/2026-10-12/`.

| Dato | Valor | Umbral sano (skill) | Lectura |
|---|---|---|---|
| Edad de la cuenta con contenido | 10 días (primer post 2026-10-07) | — | Fase "desierto": el algoritmo aún no sabe a quién mostrarte |
| Seguidores | 4 → 36 | — | +32 en 10 días; 1 a 2 al día la última semana |
| Seguidos | 292 | < seguidores | Ratio 8:1 en contra. Quien visita lee "cuenta que sigue para que la sigan" |
| Alcance 7 d | 210, 87 % no seguidores | > 50 % no seguidores | **La distribución funciona.** El algoritmo sí te muestra a desconocidos |
| Visionado medio en reels | 2,7 a 7,4 s (reels de 17 a 49 s) | retención 3 s > 60 % | **Fallan los primeros 2 segundos** |
| Retención media | 5 % a 40 % | > 30 % finalización | Solo los dos reels cortos (17 s) pasan de 35 % |
| Envíos (15 piezas) | 0 | creciente | Nadie tiene a quién mandarlo |
| Guardados (15 piezas) | 1 | creciente | Nadie siente que lo va a necesitar |
| Comentarios | 0 | con contenido | Nada invita a responder |
| Engagement rate 7 d | 5 / 210 = 2,4 % | 4-5 % | Bajo, pero con 36 seguidores no es la métrica que manda |
| Visitas a perfil desde piezas | 1 (solo se mide en carruseles) | follows/visita ≥ 2 % | Sin datos suficientes: el perfil casi no recibe visitas |

**Conclusión del diagnóstico.** No es un problema de alcance ni de algoritmo: el 87 % del alcance ya son desconocidos. Es un problema de **qué ven en el primer segundo y qué les queda al final**:

1. **Todos los reels son la misma pieza.** Texto Anton blanco y lima sobre fondo negro, música de stock, sin voz, sin cara, sin pantalla. Quince reels con el mismo molde se ven como un carrusel animado. El algoritmo "ve" el video: clasifica texto sobre fondo negro, no "ChatGPT haciendo algo". El espectador también: en 1 segundo reconoce plantilla y pasa.
2. **La IA no aparece nunca en pantalla.** En el reel "ChatGPT te recuerda pagar la luz" nunca se ve ChatGPT. Se promete una demo y se entrega una lista. Sin "prueba visual" no hay guardado (no hay nada que copiar) ni envío (no hay nada que mostrar).
3. **Se optimizaron variables dentro del molde** (logo en cuadro 0, hook de pregunta, tope de 20 s, clip de Kling detrás del título). Son ajustes de 5 a 10 % sobre un formato que tiene techo bajo. El pivote tiene que ser de formato, no de hook.
4. **Volumen sin fricción humana.** 16 piezas/semana automatizadas con cero intervención es lo contrario de lo que premia Instagram 2026 ("autenticidad > pulido"). Además, 16 piezas por semana con alcances de 10 a 57 no generan más aprendizaje: generan 16 ceros.
5. **El perfil no cierra.** 292 seguidos, bio correcta pero sin prueba social, grilla con quince portadas idénticas.

## 2. El pivote (qué cambia de verdad)

### Cambio 1 — Formato: de "texto animado" a "la IA haciéndolo, con tu voz"

Cada reel muestra **la pantalla real** de la herramienta haciendo lo que promete, grabada desde el celular o el Mac, con **voz propia** (narración de 12 a 25 s) y subtítulos automáticos. El sistema visual ia.es se mantiene como **capa**: palabra clave en lima en el tercio inferior, chip del pilar, logo pequeño. No como el cuadro completo.

Estructura fija (así se repite sin pensar):

| Segundo | Qué se ve | Qué se oye |
|---|---|---|
| 0-2 | **El resultado ya hecho** en pantalla (el aviso que llegó, el podcast sonando, el video generado) | "Esto lo hizo ChatGPT solo, cada mes" |
| 2-5 | Zoom a la herramienta + texto lima: "[resultado] con [IA], gratis" | "Mira cómo, en 3 pasos" |
| 5-18 | Pantalla grabada paso a paso, acelerada 1,5x, con el prompt visible y copiable | Narración de cada paso, 1 frase por paso |
| 18-22 | Resultado otra vez + CTA hablado y en texto | "Mándaselo a quien siempre olvida pagar / Guárdalo para el 1 del mes" |

Por qué funciona contra los datos: el gesto de guardar/enviar aparece antes del segundo 5 (regla 7 del manual), el resultado va primero (regla 8), la IA se ve (regla 6) y, sobre todo, es **distinto a la pantalla negra** que el espectador ya aprendió a saltar.

Si no quieres grabar tu voz: segunda opción es voz clonada o TTS neutro consistente (ElevenLabs / Kokoro, ya investigado en la base). Es claramente peor que tu voz, pero sigue siendo mejor que silencio con música.

### Cambio 2 — Tres series reconocibles, no 12 temas

Una cuenta nueva necesita que al tercer reel el espectador sepa "ah, es el de X". Tres series fijas, cada una con su gancho visual repetido:

1. **"Hazlo con IA en 20 s"** (lun, jue): tarea cotidiana resuelta de punta a punta en pantalla. Señal: guardado. Entregable: el prompt copiable en pantalla y en el primer comentario.
2. **"Gratis vs pago"** (mié): dos herramientas lado a lado haciendo lo mismo; una gratis. Señal: envío ("mándaselo al que sigue pagando Canva"). Tiene destinatario explícito por construcción.
3. **"Lo probé por ti"** (sáb): una herramienta nueva de la semana, veredicto en 15 s con postura. Señal: comentarios ("¿la usarías?"). Es el único espacio para noticia/curiosidad.

Carrusel del martes se mantiene (es lo único que hoy da visitas al perfil) pero con **capturas reales** de la herramienta en las slides, no solo texto.

Temas fuera hasta 2026-12-01: todo lo que se sostiene sin IA (hábitos, lenguaje corporal, 50-30-20, storytelling). Ya está en `alcance.json → fuera` y `enfoqueIA`; se respeta sin excepciones.

### Cambio 3 — Volumen: de 16 a 5 piezas/semana, y el tiempo liberado va a personas

Mix nuevo: **4 reels + 1 carrusel + stories 3 días**. El sprint de 2 reels/día (hasta 2026-11-01) se termina el 2026-10-18. Razón: 16 piezas de alcance 10-57 no enseñan más que 4; y producir 4 reels con pantalla y voz cuesta 1 a 2 h/semana de tu tiempo, que es lo que hoy falta.

Con el tiempo liberado, **30 min/día de interacción real**, que en fase 0→1.000 vale más que cualquier pieza:
- 10 cuentas objetivo de IA en español (Chile/LATAM, 5K a 100K seguidores). Comentar con valor (un dato, una alternativa gratis) en su post del día. Prohibido el emoji.
- Responder todo comentario y DM propio dentro de la primera hora de cada post.
- 1 collab post al mes con una cuenta de tamaño parecido (el reel sale en ambos perfiles). Primera meta: cerrar una antes del 2026-11-15.

### Cambio 4 — Perfil (lo más barato y lo primero)

- Dejar de seguir hasta quedar bajo 60 seguidos (solo cuentas del nicho). Hacerlo en 3 días, no en uno.
- Nombre: "IA en español · Chile" (buscable; hoy "IA en español" compite con cuentas de 500K).
- Bio: dejar la promesa en una línea y la CTA al kit. Cambiar "explicados en 30 s" por "mostrados en 20 s" cuando los reels nuevos estén arriba.
- Fijar los 3 mejores reels del formato nuevo apenas existan. Archivar (no borrar) los reels viejos con retención < 10 % cuando haya 6 nuevos: la grilla es la landing.
- Destacadas: "Prompts", "Gratis", "Kit".

### Cambio 5 — Medición: un solo experimento, una sola fecha

Se congelan los experimentos de hook, logo y ritmo. Un experimento de 2 semanas:

> **Hipótesis:** un reel de pantalla real con voz retiene y convierte más que el reel de texto animado.
> **Control:** los 15 reels publicados entre 2026-10-07 y 2026-10-18.
> **Experimento:** los 8 reels del formato nuevo entre 2026-10-20 y 2026-11-01.

Criterios de éxito al 2026-11-02 (ventana 72 h, misma que hoy):

| Métrica | Hoy | Meta |
|---|---|---|
| Visionado medio | 2,7-7,4 s | ≥ 9 s |
| Retención (visionado medio / duración) | 5-40 % | ≥ 45 % en 5 de 8 reels |
| Guardados + envíos por cada 50 de alcance | 0,2 | ≥ 2 |
| Seguidores nuevos/semana | 7-9 | ≥ 20 |
| Comentarios con texto | 0 | ≥ 5 en las 2 semanas |

Si se cumplen 3 de 5 → el formato nuevo pasa a ser el estándar y recién ahí vuelven los experimentos de hook. Si no se cumple ninguno → el problema no es el formato: se revisa nicho y propuesta de valor antes de producir más.

## 3. Calendario de ejecución

### Sáb 18 y dom 19 de octubre — Setup
- [ ] Perfil: nombre, bio, destacadas, empezar unfollow (100/día).
- [ ] Elegir 4 tareas para la semana desde `referencias/` con estado "lista" y herramienta gratis (candidatas ya respaldadas: Tareas de ChatGPT, modo estudio, NotebookLM audio, Kokoro voz).
- [ ] Grabar las 4 pantallas (celular: grabación de pantalla nativa; Mac: QuickTime). 2 a 4 min por reel. Narrar encima con el celular en mano.
- [ ] Felipe decide: voz propia o TTS. Si TTS, Claude Code genera las narraciones con la voz elegida.
- [ ] Claude Code: agregar al render el paso "clip de pantalla + capa de marca + subtítulos" (extensión de `scripts/reel-hook-video.sh`, que ya mezcla un clip detrás del hook) y dejar `config.json → mix` en 5 piezas.

### Semana 2026-10-19 — Primeros 4 reels del formato nuevo
- Lun 09:00 reel "Hazlo con IA" · Mar 14:00 carrusel con capturas · Mié 09:00 "Gratis vs pago" · Jue 09:00 "Hazlo con IA" · Sáb 09:00 "Lo probé por ti".
- Cada día: 30 min de comentarios en las 10 cuentas objetivo. Responder todo en la primera hora.
- Stories lun/mié/vie: encuesta "¿cuál pruebas primero?" sobre el reel del día.

### Semana 2026-10-26 — Repetir y derivar
- Mismo mix. El reel con más guardados+envíos de la semana anterior genera 1 derivado (mismo problema, otra herramienta).
- Enviar 3 propuestas de collab (DM corto con un reel ya hecho como muestra).

### 2026-11-02 — Decisión
- Revisar la tabla de criterios con `bucle.json` y el dashboard. Decidir estándar o replanteo. Registrar en `experimentos.md`.

## 4. Qué deja de hacerse (para que no se diluya)
- No más reels de texto sobre fondo negro sin pantalla ni voz.
- No más 2 reels/día.
- No más experimentos de hook/logo/ritmo hasta el 2026-11-02.
- No más temas sin IA visible.
- No comprar seguidores, no follow/unfollow masivo (el unfollow actual es limpieza, se hace lento y una sola vez).

## 5. Expectativa honesta
Orgánico de 0 a 1.000 toma típicamente 2 a 4 meses con este sistema sin fallas. Diez días no alcanzan para juzgar una estrategia, pero sí alcanzaron para ver que **este formato no produce ninguna de las señales que crecen una cuenta** (0 envíos, 1 guardado, 0 comentarios en 15 piezas). Por eso el pivote es ahora y no en noviembre.
