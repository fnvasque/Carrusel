import { Hook, Lead, Step, Cta } from "../../src/templates/index.ts";
import type { CarouselSpec } from "../../src/templates/types.ts";

/**
 * Generado por `npm run remix` (remix de Instagram).
 * Ángulo: Utilización avanzada para el estudio
 * Idioma: español neutro
 * Revisa y ajusta el copy antes de publicar.
 */
const carousel: CarouselSpec = {
  name: "profundiza-tu-aprendizaje-con-ia-v1",
  defaults: { pillar: "herramienta" },
  slides: [
    {
      template: Hook,
      props: {
        title: "3 razones por las que necesitas ir más allá de resumir PDFs con NotebookLM ⚠️",
        highlight: "ir más allá",
        background: { ai: "navy blue with cyan rim light editorial style, minimalistic infographic with negative space", overlay: 0.45 },
      },
    },
    {
      template: Lead,
      props: {
        text: "NotebookLM puede ser mucho más que un simple resumidor de PDFs. Aprende cómo potenciar tu aprendizaje.",
        index: 2,
        total: 6,
        background: { color: "#0B1020" },
      },
    },
    {
      template: Step,
      props: {
        heading: "01: Convierte videos a texto",
        body: "Utiliza NotebookLM para transcribir y organizar contenido de videos educativos en YouTube.",
        step: "01",
        index: 3,
        total: 6,
        background: { color: "#0B1020" },
      },
    },
    {
      template: Step,
      props: {
        heading: "02: Crea habilidades personalizadas",
        body: "Transfiere este conocimiento a Claude, desarrollando habilidades específicas para tus necesidades.",
        step: "02",
        index: 4,
        total: 6,
        background: { color: "#0B1020" },
      },
    },
    {
      template: Step,
      props: {
        heading: "03: Beneficios de un enfoque contextual",
        body: "Con una IA enriquecida con contexto detrás, mejorarás tu capacidad crítica y analítica.",
        step: "03",
        index: 5,
        total: 6,
        background: { color: "#0B1020" },
      },
    },
    {
      template: Cta,
      props: {
        title: "¿Listo para probar esta técnica?",
        reason: "Guarda este post y compártelo con tus colegas.",
        handle: "@ia_es",
        background: { color: "#0B1020" },
      },
    },
  ],
};

export default carousel;
