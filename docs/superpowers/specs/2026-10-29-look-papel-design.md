# Look «papel con presencia» (A3) — diseño

**Fecha:** 2026-10-29 · **Estado:** aprobado por Felipe (variante A3 entre A1/A2/A3).
**Reemplaza:** el look lima (spec 2026-10-05) en todas las plantillas de marca.

## Por qué

La auditoría del 2026-10-29 encontró que las plantillas comunican «cuenta de tips de IA»:
negro + lima neón, Anton en mayúsculas, grilla técnica, cabecera con el pilar interno y
sin persona. El pivote a coaching (2026-10-28) apunta a gente en nivel cero cuya barrera es
el miedo, y mide DMs «PARTIR». Felipe eligió, sobre una referencia de estilo limpio, la
variante A3: fondo papel, sans negrita con frases en serif cursiva, marcador lima detrás de
la palabra clave y una firma visible en cada lámina.

## Qué cambia (visible)

| Elemento | Antes | Ahora |
|---|---|---|
| Fondo | `#06060A` + grilla lima 7 % + viñeta | papel `#ECECEA` liso, sin grilla ni viñeta |
| Texto | `#F4F4F6` | tinta `#111111`; secundario `#555555`; apagado `#6B6B6B` |
| Titulares | Anton 400 MAYÚSCULAS | Inter 700, tal como se escriben, tracking −0,04 em |
| Frase en serif | — | prop opcional `cursiva`: esa frase en Instrument Serif cursiva, ×1,13 |
| Palabra clave (`highlight`) | texto lima | marcador lima detrás (franja 52 %–92 % del alto), texto tinta |
| Tarjetas | `#13131A` con línea `#23232E` | blanco `#FFFFFF`, sin borde, radio 28 |
| Cabecera izq. | `NN / PILAR` en mono | nombre de la serie en Inter 700 mayúsculas 26 px, tracking 0,08 em |
| Cabecera der. | wordmark `ia.es` | vacío en post; firma compacta en reel |
| Pie (post) | fuente en mono | firma (círculo tinta con iniciales «ia» en serif cursiva lima + «@ia.punto.es») a la izquierda, `n/total` en serif cursiva a la derecha; la fuente queda encima de la firma |
| Chat (`Screen`) | ventana oscura | burbujas: «Tú» tinta con texto blanco a la derecha, «La IA» blanca a la izquierda |
| Cierre (`Cta`) con PARTIR | pastilla lima | caja de mensaje directo: cabecera con la firma, burbuja tinta «PARTIR», la `reason` como pista |
| Subtítulo del reel | blanco con sombra negra | **apagado por defecto** (decisión de Felipe 2026-10-29); con `subtitulos: true` / `--subtitulos`, blanco sobre píldora tinta al 88 % |
| Portada (`Hook`) del reel | tarjeta de `resultado` arriba del titular | **sin tarjeta** (decisión de Felipe 2026-10-29): solo titular; la respuesta de la IA va en la escena 2 (`Screen`). En el post la tarjeta sigue |
| Aire | gaps ~28–40 px, tarjetas con ~36–40 px de relleno, el bloque llena el alto (reel 88 %) | gaps ~40 % mayores, tarjetas y burbujas con ~52 × 44 px de relleno en post, el bloque ocupa a lo sumo ~72 % del alto en reel y ~85 % en post (decisión de Felipe 2026-10-29: «dale más aire») |
| Barra de progreso del reel | lima | tinta |

Firma: `@ia.punto.es`, iniciales `ia`, línea `Te ayudo a partir con la IA en tu trabajo`
(la línea solo en el Hook y en la story). Vive en `theme.firma`.

Series (de `config.json → series[].serie` y `plan.piezas[].serie`):
`por-donde-partir` → «Por dónde partir», `lo-que-construi` → «Lo que construí».
Sin serie, la cabecera izquierda queda vacía (no vuelve el pilar).

### Decisiones de Felipe al revisar el reel real (2026-10-29)

«Hay demasiado texto y poco aire.» Tres cambios, regla `reel-sin-subtitulos` en
`reglas.json` (desde 2026-11-02):

1. **Sin subtítulos quemados por defecto.** La voz se sigue sintetizando y
   mezclando igual y la escena dura lo que dura la voz; solo deja de pintarse la
   píldora, y el contenido usa la altura que reservaba. Interruptor:
   `_calendario/config.json → subtitulos` (`false`), `npm run reel -- --subtitulos`.
2. **Hook del reel sin tarjeta de respuesta.** La prop `resultado` se ignora en
   reel (en post sigue); el validador deja de exigirla en reels desde
   2026-11-02, y la IA se ve en la escena 2 (`Screen`) antes del segundo 5.
3. **Más aire** en todas las escenas del reel y láminas del carrusel: más
   separación entre bloques, más relleno en tarjetas y burbujas, y un tope de
   alto para que siempre quede papel arriba y abajo (texto un poco más chico,
   cuerpo ≥ 40 px en post).

## Qué no cambia

- Lienzos 1080×1350 y 1080×1920, zonas seguras del reel, ritmo y animaciones (salvo el «pop»,
  que ahora hace crecer el marcador de izquierda a derecha en vez de cambiar el color).
- Props de las plantillas: todo lo que el planificador ya escribe sigue valiendo.
  Las nuevas (`serie`, `cursiva`) son opcionales.
- `Cover`, `Bullet`, `Quote` (legado): heredan los tokens, sin rediseño.
- `Clip`: el video va a pantalla completa; el texto encima conserva su capa oscura.

## Criterio de terminado

`npm run typecheck && npm test` en 0, `npm run test:reel` en 0, y una pieza real de la semana
del 2026-10-26 (carrusel y reel) re-renderizada sin hallazgos de la revisión visual.
Entrada `look-papel` en `kb-plantilla/_calendario/reglas.json` con `desde: 2026-11-02`.
