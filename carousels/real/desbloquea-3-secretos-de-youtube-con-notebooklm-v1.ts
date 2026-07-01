import { Hook, Lead, Step, Prompt, Cta } from "../../src/templates/index.ts";
import type { CarouselSpec } from "../../src/templates/types.ts";

/**
 * Generado por `npm run remix` (remix de Instagram).
 * Ángulo: Aprovecha YouTube de manera más eficiente
 * Idioma: español neutro
 * Revisa y ajusta el copy antes de publicar.
 */
const carousel: CarouselSpec = {
  name: "desbloquea-3-secretos-de-youtube-con-notebooklm-v1",
  defaults: { pillar: "herramienta" },
  slides: [
    {
      template: Hook,
      props: {
        title: "¿Cometes el error de usar YouTube solo para ver videos? Descubre 3 maneras de desbloquear conocimientos.",
        highlight: "error",
      },
    },
    {
      template: Lead,
      props: {
        text: "La mayoría solo ve, pero puedes convertir YouTube en una fuente de aprendizaje activa.",
        highlight: "aprendizaje activo",
        index: 2,
        total: 7,
      },
    },
    {
      template: Step,
      props: {
        heading: "Paso 01",
        step: "01/03",
        body: "Elige un video educativo en YouTube que te interese y guárdalo para profundizar.",
        highlight: "video educativo",
        index: 3,
        total: 7,
      },
    },
    {
      template: Step,
      props: {
        heading: "Paso 02",
        step: "02/03",
        body: "Transcribe el video usando herramientas online, generando un texto que puedas manipular.",
        highlight: "Transcribe",
        index: 4,
        total: 7,
      },
    },
    {
      template: Step,
      props: {
        heading: "Paso 03",
        step: "03/03",
        body: "Resumelo con NotebookLM y organiza la información por temas clave para fácil acceso.",
        highlight: "NotebookLM",
        index: 5,
        total: 7,
      },
    },
    {
      template: Prompt,
      props: {
        heading: "Lleva esto a otro nivel",
        prompt: "Conecta tus resúmenes a Claude como una habilidad personalizada para tus estudios.",
        note: "Así podrás revisar el contenido cuando lo necesites.",
        index: 6,
        total: 7,
      },
    },
    {
      template: Cta,
      props: {
        title: "Guarda y comparte para transformar tu experiencia en YouTube.",
        highlight: "Guarda",
        handle: "ia.punto.es",
      },
    },
  ],
};

export default carousel;
