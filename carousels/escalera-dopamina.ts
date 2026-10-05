import { Hook, Stat, Step, MythReality, Prompt, Cta } from "../src/templates/index.ts";
import type { CarouselSpec } from "../src/templates/types.ts";

/**
 * La escalera de la dopamina. Pilar Curiosidad. Fuentes:
 * knowledge/referencias/escalera-de-la-dopamina.md (revisado 2026-10-04) y la
 * ficha de @expert.pitch (fuentes/2026-10-04-dm-17952300600275624.md): pregunta
 * en la primera línea, nuevo visual cada 2-3 s, "si predicen los próximos 5 s, se
 * van". Reescrito según docs/auditoria/2026-10-05-auditoria-carruseles.md.
 */
const SRC = "Fuente: Kallaway, Dopamine Ladder";

const carousel: CarouselSpec = {
  name: "escalera-dopamina",
  pace: "ensenar",
  defaults: { pillar: "curiosidad" },
  slides: [
    {
      template: Hook,
      props: {
        eyebrow: "Retención",
        title: "¿En qué peldaño se va tu espectador?",
        highlight: "peldaño",
        subtitle: "6 niveles. El #5 ya no depende del video, sino de ti.",
      },
    },
    {
      template: Stat,
      props: {
        index: 2,
        total: 8,
        value: "6",
        label: "niveles: 4 del mensaje y 2 del mensajero",
        context: "Cada nivel es un control. Si falla uno, se corta la atención.",
        source: SRC,
      },
    },
    {
      template: Step,
      props: {
        index: 3,
        total: 8,
        step: "01",
        heading: "Estimula y cautiva",
        highlight: "cautiva",
        bullets: [
          "Estimula (1-2 s): movimiento, color y contraste",
          "Cautiva: abre con una pregunta en la primera línea",
          "Nuevo visual o línea cada 2-3 segundos",
        ],
        source: SRC,
      },
    },
    {
      template: Step,
      props: {
        index: 4,
        total: 8,
        step: "02",
        heading: "Anticipa y valida",
        highlight: "valida",
        bullets: [
          "Anticipa: deja que intuyan; el pico llega justo antes",
          "Valida: una respuesta no obvia o un consejo usable",
          "Si predicen los próximos 5 segundos, se van",
        ],
        source: SRC,
      },
    },
    {
      template: Step,
      props: {
        index: 5,
        total: 8,
        step: "03",
        heading: "El mensajero eres tú",
        highlight: "tú",
        bullets: [
          "Niveles 1-4: el mensaje. Niveles 5-6: tú",
          "Afecto: empiezan a apreciarte y confiar",
          "Revelación: te reconocen como fuente constante",
        ],
        source: SRC,
      },
    },
    {
      template: MythReality,
      props: {
        index: 6,
        total: 8,
        myth: "Hay un estudio que valida los 6 niveles.",
        reality: "Es un marco de creadores, sin estudios.",
        source: "La ciencia respalda la curiosidad, no los 6 niveles (Neuron, 2014)",
      },
    },
    {
      template: Prompt,
      props: {
        index: 7,
        total: 8,
        heading: "Úsalo de checklist",
        prompt:
          "Revisa este guion con la escalera de la dopamina. Para cada nivel dime si se cumple y en qué segundo:\n1. Estimulación (1-2 s)\n2. Cautivación (pregunta abierta)\n3. Anticipación\n4. Validación (respuesta no obvia)\n¿Qué peldaño es el más débil?\n[pega tu guion]",
        note: "Copia y pega. Empieza clavando los 4 primeros.",
      },
    },
    {
      template: Cta,
      props: {
        title: "Mándaselo a quien edita tus videos",
        highlight: "Mándaselo",
        reason: "O guárdalo para tu próximo guion.",
        cta: "Compartir ↗",
        handle: "ia.punto.es",
      },
    },
  ],
};

export default carousel;
