# Perfil de @ia.punto.es: por qué 146 visitas dan 1 seguidor (2026-10-13)

Dato del usuario: más de 146 visitas al perfil y 1 seguidor nuevo. Eso es una conversión
de **0,7 %**. El skill `instagram-growth-strategy` fija el umbral: ≥ 2 % es sano; bajo 1 %
el problema es la **bio y el posicionamiento**, no el contenido, y es lo primero que se
arregla porque es lo más barato. Este informe sigue ese árbol de decisión.

Fuentes: perfil público leído el 2026-10-13, `_metricas/cuenta.json` y `posts.json` de la
base (bot), `registro.jsonl`, la página de Gumroad del enlace y el skill. La base de
conocimiento **no tiene ninguna nota** sobre bio o perfil de Instagram (busqué en
`referencias/`, `temas/` y `fuentes/`: solo aparecen captions ajenos con "link in bio"), así
que las recomendaciones de redacción salen del skill y de juicio, no de la base.

## Lo que ve quien llega al perfil

| Elemento | Estado actual | Problema |
|---|---|---|
| Nombre | `IA en español` | Bien: keyword buscable. |
| Bio | 🧠 IA en español - sin hype y aplicada · 🚀 Lo que importa hoy, en 30 segundos · 📲 Reels diarios 📩 lo bueno va al correo 👇 | Tres eslóganes y ninguna promesa concreta de qué gana la persona al seguir. "Reels diarios" describe tu trabajo, no su beneficio. |
| Enlace | `saifnvasque.gumroad.com/l/celulas-claude-code` | **Promesa rota**: la bio dice "lo bueno va al correo 👇" y el enlace abre un producto para desarrolladores de Claude Code ("CÉLULAS, equipos de agentes"), con título en inglés y sin captura de correo. La audiencia de la cuenta (ver `alcance.json`: aprendizaje, productividad, finanzas personales con IA) no es esa. Quien hace clic no entiende y se va. |
| Seguidores / seguidos | 33 / 263 | Ratio 1:8. Para un visitante lee como cuenta que sigue para que la sigan. Es la señal más visible del perfil después de la foto. |
| Foto | Logo `ia.es` | Reconocible, pero sin persona (criterio K14 "mensajero" de la auditoría del 2026-10-05: ninguna pieza tiene voz propia). |
| Destacados | No se ven en el perfil público | Sin "Empieza aquí", sin prompts guardables, sin quién está detrás. |
| Fijados | No consta | La grilla la ordena la fecha: lo primero que se ve es la pieza más reciente, no la mejor. |
| Grilla | Todas las portadas iguales (negro + lima + Anton) | Coherente, pero desde el perfil no se distingue un tema de otro: ocho rectángulos negros. |

## Lo que dicen las métricas de la cuenta

| Métrica (7 d al 2026-10-13) | Valor | Lectura |
|---|---|---|
| Alcance | 168 | |
| Alcance a no seguidores | 150 (89 %) | El descubrimiento funciona a escala micro: casi todo el alcance es gente nueva. |
| Cuentas con interacción | 4 | 2,4 % del alcance. |
| Visitas al perfil → seguidores | 146 → 1 (0,7 %) | **El cuello de botella es el perfil.** |
| Envíos por DM (6 piezas) | 0 | Ninguna pieza tiene destinatario explícito. |
| Guardados (6 piezas) | 1 | |
| Retención de reels | 4 % a 24 % | Muy bajo el 60 % que pide el skill; segundo problema, después del perfil. |

Conclusión: la gente llega (150 cuentas nuevas por semana ven algo y 146 pasan por el
perfil) y no encuentra una razón para quedarse. Arreglar el perfil convierte el tráfico
que **ya** existe; mejorar hooks viene después.

## Estado al 2026-10-13 (noche): perfil cambiado

Verificado en el perfil público:

- **Bio** (143 caracteres): "IA que puedes usar hoy, sin saber programar / Prompts y herramientas
  gratis, explicados en 30 s 🇨🇱 / 👇 Kit gratis: 7 días para usar IA de verdad".
- **Enlace**: <https://saifnvasque.gumroad.com/l/kit-arranque-ia> (el kit, a $0+, pide correo).
  El usuario lo cambió desde la app móvil.
- **Fijados** (por el usuario, desde el móvil): reel de gastos del mes, carrusel del mito del
  prompt perfecto y carrusel de 6 preguntas; se ven con el pin en la grilla.
- **Pendiente**: destacados (4), el post "Empieza aquí" y la decisión sobre los 263 seguidos.
- **Medición**: código listo en esta rama (`visitasPerfil7d`, `clicsEnlace7d`, línea de
  conversión en el resumen); falta desplegar al servidor. Primera lectura comparable: resumen
  del domingo 2026-10-19 (antes: 146 visitas → 1 seguidor, 0,7 %).

## Cambios al perfil (los aplica el usuario en la app)

### 1. Bio nueva (≤ 150 caracteres, una promesa + un CTA)

Estructura: línea 1 = qué te llevas; línea 2 = para quién y cómo; línea 3 = un solo gesto.

Opción A (recomendada, promesa material):
```
IA que puedes usar hoy, sin saber programar
Prompts y herramientas gratis, explicados en 30 s 🇨🇱
👇 Guía gratis: 10 prompts para empezar
```

Opción B (identificación con el problema):
```
¿La IA te suena a hype? Aquí la ves funcionando
1 herramienta útil por día, en español y sin jerga
👇 Empieza con los 10 prompts que más uso
```

Opción C (si prefieres mantener el correo):
```
IA aplicada, en español y sin hype
Cada reel: 1 herramienta o prompt que puedes copiar
📩 Lo mejor de la semana, en tu correo 👇
```

Reglas que cumplen las tres: la keyword "IA" en la primera línea (la bio es buscable),
beneficio antes que formato, un solo CTA que coincide con el enlace.

### 2. El enlace tiene que cumplir lo que la bio promete

Hoy el enlace y la promesa no coinciden. Dos salidas, elige una:

- **A/B (recomendada):** un recurso gratis para la audiencia de la cuenta ("10 prompts para
  empezar", PDF o página de Gumroad a precio 0 con correo obligatorio). Gumroad ya pide
  correo al "comprar" a $0, así que captura la lista sin otra herramienta. El carrusel
  `mar-carrusel-6-preguntas-mensaje` y los prompts ya publicados sirven de materia prima.
- **C:** un formulario de newsletter real (Substack, Beehiiv o un Google Form) y recién ahí
  mantener "lo bueno va al correo".

El producto CÉLULAS para Claude Code puede quedar como segundo enlace (Instagram permite
hasta 5), nunca como el primero.

### 3. Seguidos: bajar de 263 a menos de 60

Dejar de seguir cuentas que no son del nicho ni fuentes, a un ritmo de 20-30 por día para
no gatillar límites. Objetivo: que el ratio no sea lo primero que llame la atención. No
usar follow/unfollow como táctica (regla del skill); esto es limpieza de una vez.

### 4. Tres fijados (en este orden)

1. **"Empieza aquí"**: carrusel nuevo de 5 slides: qué es la cuenta, para quién, qué se
   lleva cada semana, los 3 mejores posts, el CTA al recurso gratis. Es el post semilla de
   la Fase 0 del skill y hoy no existe.
2. La pieza con más guardados o envíos a 7 d (hoy `sab-reel-gastos-del-mes-con-chatgpt`,
   la única con un guardado; se reemplaza cuando el bucle encuentre una mejor).
3. Un carrusel con entregable copiable (prompt o lista), p. ej.
   `mar-carrusel-6-preguntas-mensaje`.

### 5. Destacados (4, con portadas en el sistema lima)

`Empieza aquí` · `Prompts` · `Herramientas` · `Quién soy` (una story con cámara frontal y
voz propia: la única pieza "humana" del perfil; cubre el criterio K14).

### 6. Foto de perfil

Mantener el logo si la marca es la cuenta, pero probar durante 4 semanas una foto de
persona con el fondo lima de marca: en cuentas pequeñas la cara convierte mejor que el
logo (juicio del skill: "autenticidad > pulido"; no hay dato propio todavía).

## Qué cambia en el código (este PR)

Para que la conversión del perfil se mida sola y no dependa de mirar la app:

- `fetchAccountInsights` pide además `profile_views` y `website_clicks` (7 d) a Meta; si
  la consulta falla, el resto de la instantánea sigue (`src/insights/client.ts`).
- `_metricas/cuenta.json` guarda `visitasPerfil7d` y `clicsEnlace7d` (`src/insights/snapshots.ts`).
- El resumen semanal (Markdown y Telegram) agrega "Visitas al perfil (7 d): N · conversión a
  seguidores X % (sano ≥ 2 %)" y "Clics al enlace de la bio (7 d): N". Bajo 1 % avisa
  "revisar bio y enlace antes que el contenido" (`src/insights/summary.ts`).

Pendiente para que corra: desplegar al servidor (`scripts/deploy-to-server.sh`), como se
hizo con el PR #34. Hasta entonces el bot sigue escribiendo `cuenta.json` sin visitas.

## Cómo saber si funcionó

Mismas ventanas siempre: 7 días, domingo a domingo, en el resumen del bot.

| Semana | Visitas | Seguidores nuevos | Conversión | Meta |
|---|---|---|---|---|
| al 2026-10-13 (antes) | 146 | 1 | 0,7 % | |
| al 2026-10-19 (bio nueva + enlace) | | | | ≥ 1 % |
| al 2026-10-26 (fijados + destacados) | | | | ≥ 2 % |
| al 2026-11-02 | | | | ≥ 2 % sostenido |

Si a las 4 semanas la conversión sigue bajo 2 % con el perfil arreglado, el siguiente
paso del árbol es la retención de los reels (hooks), con `reels-hooks-ia`.

Registrar el cambio de bio en `_calendario/experimentos.md` como experimento de la semana
2026-10-19 (variable `perfil`), para que el bucle no lo mezcle con los de contenido.
