# Carrusel explicativo (plantilla `Concepto`) — diseño

**Fecha:** 2026-10-30 · **Pedido:** Felipe, a partir de tres posts de otras cuentas (Daniel Pink,
«The Planning Fallacy»; Success Theory, «Stop Seeking Permission»; Andrés Bilbao, líder amable vs.
líder bueno): un formato para «escribir algo más largo y explicar en simple», que salga de vez en
cuando y esté integrado en todo el flujo.

## Qué es

Un carrusel que cuenta **una** idea de IA en 3 a 5 láminas `Concepto`. Cada lámina se lee de arriba
abajo:

| Prop | Tope | Qué lleva |
|---|---|---|
| `numero` | — | "1", "2"… en el cuadro lima (como `Step`) |
| `titulo` (+ `highlight`, `cursiva`) | 6 palabras | El nombre de lo que pasa, en palabras de oficina |
| `idea` | 18 | Lo que le pasa al lector, no la teoría |
| `contraste` (opcional) | 16 | La distinción en negrita, al estilo Bilbao |
| `enSimple` | 35 | Bajo «En simple:» (serif cursiva sobre el marcador, el «Takeaway:» de Pink): primera persona y una acción |
| `rotulo` (opcional) | — | Cambia «En simple»; `""` lo quita |

La lámina entera, ≤ 60 palabras. Solo carrusel (no cabe en una escena de reel de 35 s).

## Cuándo

`config.json → explicativo = { desde: "2026-11-23", cadaSemanas: 2 }`: lo fija el usuario, no el
planificador. Esas semanas el carrusel del mix lleva `plan.piezas[].variante: "explicativo"` y
conserva formato, arquetipo y serie. Nunca en una semana del paquete. El validador lo exige en ambos
sentidos (la semana que toca necesita uno; fuera de turno, `Concepto` es error).

## Revisión adversaria (lo que cambió)

La propuesta inicial tenía dos plantillas (`Concepto` y una `Nota` estilo tweet), `idea` de 2 frases,
`enSimple` de 45 palabras, hasta 3 viñetas «Cómo usarlo» y la frecuencia a criterio del planificador.
El adversario la atacó en cinco puntos; se adoptaron todos:

1. **`Nota` estilo tweet descartada**: foto y nombre chocan con la firma sin nombre; el contraste en
   negrita entra como prop `contraste` de `Concepto`.
2. **Muro de texto**: topes por campo y ≤ 60 por lámina; sin viñetas (compiten con `enSimple`).
3. **Nivel cero y primera persona**: una idea por carrusel (no cinco conceptos con nombre propio),
   `enSimple` en primera persona, título sin términos técnicos. Guía de redacción §11 con un
   ejemplo malo (la «falacia de la planificación» dicha como diccionario) y uno bueno.
4. **Medible y sin chocar con el paquete**: frecuencia fija en `config.json`, empieza después del
   paquete (2026-11-23), `variante` en el plan para comparar carruseles con y sin ella, entrada
   `carrusel-explicativo` en `reglas.json`.
5. **Reels**: `Concepto` prohibido en reels.

## Dónde toca

`src/templates/Concepto.tsx`, registro del remix (exclusiva del calendario, como `Clip`),
`validar.mjs` (catálogo, topes, reel, variante, frecuencia, `config.explicativo`, lector frío),
`virality.ts` (Concepto cuenta como desarrollo y numerado; con `contraste`, como replanteo),
`INSTRUCCIONES.md`, `guia-redaccion.md`, `lector-frio.md`, `config.json`, `reglas.json`,
`carousels/ejemplo-explicativo.ts` y tests.

## Pendiente

- El bucle del bot no guarda `variante` en `bucle.json → piezas`; mientras tanto la comparación se
  hace por id contra los `plan.json`. Si la variante se queda, llevarla al registro del bot.
- `scripts/kb-calendario-install.sh` no pisa un `config.json` existente: hay que agregar
  `explicativo` a mano en la base.
