import { Hook, Lead, Step, MythReality, Prompt, Cta } from "../src/templates/index.ts";
import type { CarouselSpec } from "../src/templates/types.ts";

/**
 * La escalera de la dopamina: 6 niveles para retener la atención. Pilar
 * Curiosidad. Fuente: knowledge/referencias/escalera-de-la-dopamina.md
 * (revisado 2026-10-04): marco de Kallaway; 4 niveles del mensaje + 2 del
 * mensajero; sin estudios que validen el marco (solo la premisa de curiosidad,
 * Neuron 2014). El consejo "clava los 4 primeros" viene de la misma nota.
 */
const BG = { gradient: "linear-gradient(160deg,#0B1020 0%,#151D33 100%)" };
const SRC = "Fuente: Kallaway, Dopamine Ladder";

const carousel: CarouselSpec = {
  name: "escalera-dopamina",
  defaults: { pillar: "curiosidad" },
  slides: [
    {
      template: Hook,
      props: {
        eyebrow: "Retención",
        title: "6 niveles para que no te hagan scroll",
        highlight: "scroll",
        subtitle: "El #5 ya no depende del video, sino de ti.",
        background: {
          ai: "a glowing cyan staircase of six floating steps ascending into darkness, deep navy background, minimalist, generous negative space",
          overlay: 0.62,
        },
      },
    },
    {
      template: Lead,
      props: {
        kicker: "La escalera de la dopamina",
        text: "Cada nivel es un control: si fallas uno, se corta la atención.",
        highlight: "se corta",
        background: BG,
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
          "Estimulación: usa movimiento, color y contraste en los primeros 1-2 segundos",
          "Cautivación: abre una pregunta que quieran ver resuelta",
        ],
        source: SRC,
        background: BG,
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
          "Anticipación: deja que intuyan la respuesta; el pico llega justo antes",
          "Validación: cierra con una respuesta no obvia o un consejo usable",
        ],
        source: SRC,
        background: BG,
      },
    },
    {
      template: Step,
      props: {
        index: 5,
        total: 8,
        step: "03",
        heading: "Afecto y revelación",
        highlight: "revelación",
        bullets: [
          "Afecto: la confianza pasa del video a ti",
          "Revelación: te ven como fuente constante de valor",
        ],
        source: SRC,
        background: BG,
      },
    },
    {
      template: MythReality,
      props: {
        index: 6,
        total: 8,
        mythLabel: "Ojo Nº1",
        myth: "Es ciencia comprobada.",
        reality: "Es un marco de creadores.",
        source: "La ciencia respalda la curiosidad, no los 6 niveles (Neuron, 2014)",
        background: BG,
      },
    },
    {
      template: Prompt,
      props: {
        index: 7,
        total: 8,
        heading: "Úsalo de checklist",
        prompt:
          "Revisa este guion con la escalera de la dopamina:\n1. ¿Qué estimula en los primeros 2 segundos?\n2. ¿Qué pregunta abre?\n3. ¿Dónde está el pico de anticipación?\n4. ¿Qué respuesta no obvia entrega?\n[pega tu guion]",
        note: "Copia y pega. Empieza clavando los 4 primeros niveles.",
        background: BG,
      },
    },
    {
      template: Cta,
      props: {
        title: "Mándaselo a quien edita tus videos",
        highlight: "Mándaselo",
        reason: "Y recibe lo que importa en IA, cada semana en tu correo.",
        handle: "ia.punto.es",
        background: {
          ai: "an abstract half-open mail envelope with cyan light pouring out, navy background",
          overlay: 0.5,
        },
      },
    },
  ],
};

export default carousel;
