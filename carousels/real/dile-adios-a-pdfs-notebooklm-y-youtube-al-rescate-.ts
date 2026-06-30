import { Hook, Lead, Step, MythReality, Cta } from "../../src/templates/index.ts";
import type { CarouselSpec } from "../../src/templates/types.ts";

/**
 * Generado por `npm run remix` (remix de Instagram).
 * Ángulo: Expande tu uso de NotebookLM a los videos online
 * Idioma: español neutro
 * Revisa y ajusta el copy antes de publicar.
 */
const carousel: CarouselSpec = {
  name: "dile-adios-a-pdfs-notebooklm-y-youtube-al-rescate-",
  defaults: { pillar: "herramienta" },
  slides: [
    {
      template: Hook,
      props: {
        title: "No más PDFs: Descubre 5 pasos para llevar YouTube a NotebookLM",
        highlight: "No más",
      },
    },
    {
      template: Lead,
      props: {
        text: "NotebookLM está transformando la forma de estudio. ¿Sabías que también lo hace con videos?",
        highlight: "transformando",
        index: 2,
        total: 7,
      },
    },
    {
      template: Step,
      props: {
        heading: "Paso 01",
        step: "01/06",
        body: "Encuentra un video educativo en YouTube clave para tu investigación.",
        highlight: "video educativo",
        index: 3,
        total: 7,
      },
    },
    {
      template: Step,
      props: {
        heading: "Paso 02",
        step: "02/06",
        body: "Transcribe el contenido del video usando una herramienta como otter.ai o Zoom.",
        highlight: "Transcribe",
        index: 4,
        total: 7,
      },
    },
    {
      template: Step,
      props: {
        heading: "Paso 03",
        step: "03/06",
        body: "Carga la transcripción en NotebookLM y organízala en secciones clave para estudiarla.",
        highlight: "Carga",
        index: 5,
        total: 7,
      },
    },
    {
      template: MythReality,
      props: {
        myth: "NotebookLM es solo para PDFs pesados.",
        reality: "¡Falso! Puedes convertir cualquier contenido, incluso videos, en conocimiento organizado.",
        mythLabel: "Mito",
        realityLabel: "Realidad",
        index: 6,
        total: 7,
      },
    },
    {
      template: Cta,
      props: {
        title: "Revoluciona tu aprendizaje. Guárdalo y compártelo.",
        highlight: "Guárdalo",
        handle: "ia.punto.es",
      },
    },
  ],
};

export default carousel;
