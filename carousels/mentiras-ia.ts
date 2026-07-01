import { Hook, MythReality, Cta } from "../src/templates/index.ts";
import type { CarouselSpec } from "../src/templates/types.ts";

/**
 * Carrusel 2 — 5 mentiras sobre la IA que te frenan. Pilar Curiosidad (chip rosa).
 * Pasó el filtro .context/04-quality-gate-viral.md desde el borrador:
 * hook con enemigo (las mentiras/FOMO) + tease del #3, formato mito→realidad
 * (reframe inherente = muy compartible), mitos numerados (retención), CTA único
 * de compartir. Textos de panel cortos para no desbordar a 64px.
 */
const carousel: CarouselSpec = {
  name: "mentiras-ia",
  defaults: { pillar: "curiosidad" },
  slides: [
    {
      template: Hook,
      props: {
        eyebrow: "Mito o realidad",
        title: "5 mentiras sobre la IA que te frenan",
        highlight: "mentiras",
        subtitle: "Y por qué la #3 te está costando plata.",
      },
    },
    {
      template: MythReality,
      props: {
        index: 2,
        total: 7,
        mythLabel: "Mentira Nº1",
        myth: "La IA te quitará el trabajo.",
        reality: "Te reemplaza quien sabe usarla.",      },
    },
    {
      template: MythReality,
      props: {
        index: 3,
        total: 7,
        mythLabel: "Mentira Nº2",
        myth: "Necesitas saber de tecnología.",
        reality: "Si usas WhatsApp, sabes usarla.",      },
    },
    {
      template: MythReality,
      props: {
        index: 4,
        total: 7,
        mythLabel: "Mentira Nº3",
        myth: "Hay que pagar para que sirva.",
        reality: "Gratis ya hace el 90%.",      },
    },
    {
      template: MythReality,
      props: {
        index: 5,
        total: 7,
        mythLabel: "Mentira Nº4",
        myth: "La IA siempre tiene la razón.",
        reality: "Inventa. Tú revisas y decides.",      },
    },
    {
      template: MythReality,
      props: {
        index: 6,
        total: 7,
        mythLabel: "Mentira Nº5",
        myth: "Ya es muy tarde para empezar.",
        reality: "Estamos todos empezando.",      },
    },
    {
      template: Cta,
      props: {
        title: "Mándaselo a quien le teme a la IA",
        highlight: "Mándaselo",
        reason: "Y recibe lo que importa en IA, cada semana en tu correo.",
        handle: "ia.punto.es",
      },
    },
  ],
};

export default carousel;
