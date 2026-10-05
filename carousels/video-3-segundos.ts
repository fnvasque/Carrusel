import { Hook, Stat, Step, MythReality, Cta } from "../src/templates/index.ts";
import type { CarouselSpec } from "../src/templates/types.ts";

/**
 * Tus primeros 3 segundos. Pilar Curiosidad. Datos de
 * knowledge/referencias/hook-de-video.md (revisado 2026-10-04). Reescrito según
 * docs/auditoria/2026-10-05-auditoria-carruseles.md: dato como gancho, cifras en
 * pantalla (Stat), alcance explícito (estudios de anuncios encargados por Meta),
 * antes/después y un solo CTA.
 */
const carousel: CarouselSpec = {
  name: "video-3-segundos",
  pace: "ensenar",
  defaults: { pillar: "curiosidad" },
  slides: [
    {
      template: Hook,
      props: {
        eyebrow: "Meta + Nielsen · anuncios en video",
        title: "Hasta 47% del valor se juega en 3 segundos",
        highlight: "47%",
        mark: "3 segundos",
        subtitle: "¿Qué pasa en los tuyos? Así abres mejor.",
      },
    },
    {
      template: Stat,
      props: {
        index: 2,
        total: 7,
        value: "47%",
        label: "del valor de un anuncio en video llega en los primeros 3 segundos",
        context: "Y hasta el 74% en los primeros 10. Son estudios encargados por la plataforma.",
        source: "Fuente: Meta / Nielsen",
      },
    },
    {
      template: Stat,
      props: {
        index: 3,
        total: 7,
        value: "65%",
        label: "de quienes ven 3 segundos sigue al menos 10",
        context: "Y el 45% llega a los 30. Úsalo para ubicar tu promesa, no como ley.",
        source: "Fuente: Meta / Nielsen",
      },
    },
    {
      template: Step,
      props: {
        index: 4,
        total: 7,
        step: "01",
        heading: "TikTok pide 3 y 6 segundos",
        highlight: "3 y 6",
        bullets: [
          "0-3 s: muestra la propuesta",
          "Hasta el 6: sostén con suspenso o sorpresa",
          "Vertical 9:16, mínimo 720p y con sonido",
          "Respeta la zona segura de la app",
        ],
        source: "Fuente: TikTok, guía creativa de anuncios",
      },
    },
    {
      template: MythReality,
      props: {
        index: 5,
        total: 7,
        mythLabel: "Antes",
        myth: "Saludo y logo en el primer cuadro.",
        realityLabel: "Después",
        reality: "El resultado y el titular desde el cuadro 1.",
        source: "Ejemplo ilustrativo",
      },
    },
    {
      template: Step,
      props: {
        index: 6,
        total: 7,
        step: "02",
        heading: "Revisa dónde abandonan",
        highlight: "abandonan",
        bullets: [
          "Abre la retención de tu video en tus métricas",
          "Una caída puntual: esa parte se la saltan",
          "Una línea plana: lo miran de corrido",
        ],
        source: "Fuente: YouTube, informe de retención",
      },
    },
    {
      template: Cta,
      props: {
        title: "Guárdalo antes de editar",
        highlight: "Guárdalo",
        reason: "Tu checklist para los primeros 3 segundos: promesa, gancho, titular.",
        cta: "Guardar",
        handle: "ia.punto.es",
      },
    },
  ],
};

export default carousel;
