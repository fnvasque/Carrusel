import { Hook, Lead, Step, MythReality, Cta } from "../../src/templates/index.ts";
import type { CarouselSpec } from "../../src/templates/types.ts";

/**
 * Generado por `npm run remix` (remix de Instagram).
 * Ángulo: Optimización de flujos de trabajo
 * Idioma: español neutro
 * Revisa y ajusta el copy antes de publicar.
 */
const carousel: CarouselSpec = {
  name: "optimiza-tu-productividad-con-ia-v2",
  defaults: { pillar: "herramienta" },
  slides: [
    {
      template: Hook,
      props: {
        title: "Descubre por qué resumir PDFs con NotebookLM no es suficiente 🚫",
        highlight: "no es suficiente",
        background: { ai: "navy blue with cyan rim light editorial style, minimalistic infographic with negative space", overlay: 0.5 },
      },
    },
    {
      template: Lead,
      props: {
        text: "Más allá de los resúmenes: transforma tu flujo de trabajo integrando distintas tecnologías con NotebookLM.",
        index: 2,
        total: 6,
        background: { color: "#0B1020" },
      },
    },
    {
      template: Step,
      props: {
        heading: "Paso 1: Transcribe y organiza",
        body: "Utiliza NotebookLM para extraer información de video y estructurarla de manera eficaz.",
        step: "01",
        index: 3,
        total: 6,
        background: { color: "#0B1020" },
      },
    },
    {
      template: Step,
      props: {
        heading: "Paso 2: Implementa en Claude",
        body: "Usemos Claude para convertir el conocimiento en habilidades específicas y aplicables.",
        step: "02",
        index: 4,
        total: 6,
        background: { color: "#0B1020" },
      },
    },
    {
      template: MythReality,
      props: {
        myth: "Myth: Solo sirve para resúmenes.",
        reality: "Reality: Potencia tu productividad combinando IA y contexto relevante.",
        mythLabel: "01",
        realityLabel: "Realidad",
        index: 5,
        total: 6,
        background: { color: "#0B1020" },
      },
    },
    {
      template: Cta,
      props: {
        title: "Impulsa tu productividad.",
        reason: "Guarda esta técnica para aplicarla más tarde y compártela con tus compañeros.",
        handle: "@ia_es",
        background: { color: "#0B1020" },
      },
    },
  ],
};

export default carousel;
