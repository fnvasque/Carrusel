import { Hook, Lead, Step, Cta } from "../src/templates/index.ts";
import type { CarouselSpec } from "../src/templates/types.ts";

/**
 * Tu video se decide en 3 segundos. Pilar Curiosidad. Datos de
 * knowledge/referencias/hook-de-video.md (revisado 2026-10-04): Meta/Nielsen
 * (47 % en 3 s, 74 % en 10 s; 65 % → 10 s, 45 % → 30 s) y guía creativa de TikTok
 * (propuesta en 3 s, hook hasta el 6, 9:16, ≥720p, sonido, zona segura).
 */
const BG = { gradient: "linear-gradient(160deg,#0B1020 0%,#151D33 100%)" };

const carousel: CarouselSpec = {
  name: "video-3-segundos",
  defaults: { pillar: "curiosidad" },
  slides: [
    {
      template: Hook,
      props: {
        eyebrow: "Lo que miden Meta y TikTok",
        title: "Tu video se decide en 3 segundos",
        highlight: "3 segundos",
        subtitle: "No es exageración. Te muestro por qué, con datos.",
        background: {
          ai: "a glowing cyan stopwatch frozen at three seconds floating over a dark navy void, motion blur streaks of light, minimalist, generous negative space",
          overlay: 0.5,
        },
      },
    },
    {
      template: Lead,
      props: {
        kicker: "En una frase",
        text: "Si los primeros 3 segundos no enganchan, el resto del video no se ve.",
        highlight: "3 segundos",
        background: BG,
      },
    },
    {
      template: Step,
      props: {
        index: 3,
        total: 7,
        step: "01",
        heading: "Meta lo midió",
        highlight: "midió",
        body: "Con Nielsen: hasta el 47% del valor de una campaña de video llega en los primeros 3 segundos. Hasta el 74%, en los primeros 10.",
        source: "Fuente: Meta / Nielsen",
        background: BG,
      },
    },
    {
      template: Step,
      props: {
        index: 4,
        total: 7,
        step: "02",
        heading: "Quien pasa los 3, se queda",
        highlight: "se queda",
        body: "De quienes ven 3 segundos, el 65% sigue al menos 10 y el 45% llega a 30. Usa esa ventana para tu promesa.",
        source: "Fuente: Meta / Nielsen",
        background: BG,
      },
    },
    {
      template: Step,
      props: {
        index: 5,
        total: 7,
        step: "03",
        heading: "La regla de TikTok",
        highlight: "TikTok",
        bullets: [
          "Haz la promesa en los primeros 3 segundos",
          "Sostén el gancho hasta el segundo 6",
          "Usa vertical 9:16, mínimo 720p y sonido",
          "Respeta la zona segura de la app",
        ],
        source: "Fuente: TikTok, buenas prácticas creativas",
        background: BG,
      },
    },
    {
      template: Step,
      props: {
        index: 6,
        total: 7,
        step: "04",
        heading: "Cómo lo aplico",
        highlight: "aplico",
        bullets: [
          "Haz que lo primero que se vea sea el resultado",
          "Escribe el titular en pantalla desde el cuadro 1",
          "Revisa en tus métricas dónde abandonan",
        ],
        background: BG,
      },
    },
    {
      template: Cta,
      props: {
        title: "Guárdalo para tu próximo video",
        highlight: "Guárdalo",
        reason: "Lo que importa en IA y contenido, cada semana en tu correo.",
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
