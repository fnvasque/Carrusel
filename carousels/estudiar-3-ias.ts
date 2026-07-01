import { Hook, Lead, Step, Cta } from "../src/templates/index.ts";
import type { CarouselSpec } from "../src/templates/types.ts";

/**
 * Carrusel 1 (v2, pasó el filtro .context/04-quality-gate-viral.md) —
 * 3 IAs gratis para estudiar. Pilar Herramienta (chip cian).
 * Optimizado para guardados/compartidos: hook contrarian + enemigo (preuni),
 * reframe del dolor, valor accionable por slide (mini-prompt), CTA único (guardar).
 * Identidad clara: sin fondos: todos los slides van sobre la superficie crema de marca.
 */
const carousel: CarouselSpec = {
  name: "estudiar-3-ias",
  defaults: { pillar: "herramienta" },
  slides: [
    {
      template: Hook,
      props: {
        eyebrow: "Herramienta del día",
        title: "No pagues preuniversitario todavía",
        highlight: "todavía",
        subtitle: "3 IAs gratis que hacen el 80% del trabajo pesado.",
      },
    },
    {
      template: Lead,
      props: {
        index: 2,
        total: 7,
        kicker: "La verdad incómoda",
        text: "El problema no es que no estudies. Es que estudias sin sistema y solo.",
        highlight: "sin sistema",
      },
    },
    {
      template: Step,
      props: {
        index: 3,
        total: 7,
        step: "01",
        heading: "NotebookLM",
        body: "Súbele tus apuntes y PDFs → resúmenes, guía de estudio y un pódcast para repasar caminando. Pídele: “hazme 10 preguntas de práctica”. Gratis.",
        source: "notebooklm.google.com",
      },
    },
    {
      template: Step,
      props: {
        index: 4,
        total: 7,
        step: "02",
        heading: "Perplexity",
        body: "Busca con IA y responde con las fuentes citadas. Cero datos inventados en tu ensayo. Pídele: “dame 5 fuentes confiables sobre X”. Gratis (estudiante ~US$10/mes).",
        source: "perplexity.ai",
      },
    },
    {
      template: Step,
      props: {
        index: 5,
        total: 7,
        step: "03",
        heading: "ChatGPT + Feynman",
        highlight: "Feynman",
        body: "Pídele que te explique un tema. Luego explícaselo tú a él. Donde te trabes, ahí está lo que no sabías. Gratis.",
        source: "chatgpt.com",
      },
    },
    {
      template: Step,
      props: {
        index: 6,
        total: 7,
        heading: "El sistema: $0",
        highlight: "$0",
        body: "Perplexity para investigar → NotebookLM para ordenar tus apuntes → ChatGPT para repasar. Un flujo completo de estudio, sin pagar nada.",
      },
    },
    {
      template: Cta,
      props: {
        title: "Guárdalo antes de tu próxima prueba",
        highlight: "Guárdalo",
        reason: "Los 10 prompts exactos te los mando al correo.",
        handle: "ia.punto.es",
      },
    },
  ],
};

export default carousel;
