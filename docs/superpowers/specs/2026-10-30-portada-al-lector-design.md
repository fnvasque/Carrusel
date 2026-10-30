# Portada al lector, con la promesa en el título

Fecha: 2026-10-30. Regla en `reglas.json`: `portada-al-lector`, desde 2026-10-31.

## Problema

Felipe rechazó dos portadas que habían pasado el juez (nota 8) y los dos lectores fríos:

- «Nunca supe qué pedirle a la IA» + «Así partí: que me preguntara»: es mi confesión, no la
  promesa del lector. Solo con el título no se sabe qué se gana.
- «“¿Cómo va tu área?” Informe listo» + «Mis notas, ordenadas por ChatGPT»: «Informe listo»
  no dice qué informe ni con qué. La promesa quedó en el subtítulo.

## Causas (revisión adversaria independiente, 2026-10-30)

1. La guía de hooks y el manual pedían primera persona «en pantalla», y sus ejemplos eran
   confesiones («No sabía qué era un agente hasta que le pregunté a la IA»). El planificador
   copia los ejemplos.
2. La regla 8 dejaba la promesa en el título **o** en el subtítulo, pero el lector con prisa
   (P7) mira solo el título.
3. Con los reels sin voz (`config.voz` false), nadie dice la promesa: el manual seguía con «el
   `subtitle` sobra: la narración lo dice».
4. El juez veía la tarjeta de `resultado`, que el reel ya no pinta, y completaba con ella lo que
   el lector «se lleva».
5. El planificador podía repetir el lector frío hasta que la 7 pasara.

Descartado: subir `hookUmbral` a 8. Las dos portadas sacaron 8, así que no las habría parado.

## Cambios

- `guia-hooks.md`:
  - La portada le habla al lector (su situación o su resultado, en «tú» o impersonal, con la
    IA que lo hace); el cuerpo sigue en primera persona.
  - La promesa va en el título; el subtítulo la amplía.
  - Ejemplos nuevos, los dos rechazados como «Mal», y el formato de candidato del reel con
    `subtitle`.
  - «Para el juez»: cuatro preguntas, la 3 es `soloTitulo`; el juez no puede elegir un «no sé»
    ni un pulgar «no».
- `validar.mjs`:
  - `mensajeJuez(seccion, candidatos, formato)` omite el `resultado` en reels.
  - Desde `DESDE_PORTADA_LECTOR` (2026-10-31), `vetoDelJuez` rechaza un elegido sin
    `soloTitulo`, con «no sé» al inicio o con `pulgar` distinto de «sí».
- `INSTRUCCIONES.md`:
  - Regla 8: ejemplo nuevo.
  - El subtítulo vuelve en reels sin voz.
  - «Voz»: primera persona en el cuerpo; la portada le habla al lector.
  - Paso del juez: `soloTitulo` y el veto.
- `guia-redaccion.md`: la primera persona aplica al cuerpo y a la voz.
- `lector-frio.md`: la 7 pide además el «con qué» o el «cómo». Un «no sé» del lector con prisa
  bloquea en cualquier ronda: se cambia la portada, no se repite el lector.
- `reglas.json`:
  - Se agrega `portada-al-lector`.
  - `pivote-coaching`, `look-papel` y `reel-sin-subtitulos` pasan al 2026-10-31, el primer día
    en que se publicó con ellas.

## Pendiente (no entra aquí)

- Que el validador compare la 7 del lector con el entregable por palabras clave, en vez de que
  la evalúe el mismo planificador.
- Tu aprobación de cada portada en la revisión visual, para medir si el juez coincide contigo
  (meta: ≥ 80 % antes de confiar en su nota).

## Verificación

`npm run typecheck && npm test`. Tests nuevos en `test/calendario/validar.ts`
(`portada-al-lector: …`). En `test/calendario/reglas.ts` se actualizó la lista sembrada: tres
fechas pasan al 2026-10-31 y se agrega la regla nueva.
