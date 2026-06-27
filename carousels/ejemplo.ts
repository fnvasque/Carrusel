import { Cover, Bullet, Quote } from "../src/templates/index.ts";
import type { CarouselSpec } from "../src/templates/types.ts";

/**
 * Carrusel de ejemplo. Cópialo para crear los tuyos.
 *
 * Cada slide elige una plantilla (Cover / Bullet / Quote) y le pasa props:
 * textos, colores, fuente y fondo. El fondo puede ser:
 *   { color: "#0A0A0A" }
 *   { gradient: "linear-gradient(135deg,#7C3AED,#2563EB)" }
 *   { image: "./mi-foto.png" }
 *   { ai: "fondo abstracto morado, minimalista", overlay: 0.45 }  // requiere OPENAI_API_KEY
 */
const carousel: CarouselSpec = {
  name: "ejemplo",
  // Valores por defecto para todos los slides (se pueden sobreescribir por slide).
  defaults: { accent: "#A78BFA" },
  slides: [
    {
      template: Cover,
      props: {
        eyebrow: "GUÍA RÁPIDA",
        title: "5 errores al automatizar tu contenido",
        subtitle: "Y cómo evitarlos con código",
        background: { gradient: "linear-gradient(135deg,#1E1B4B 0%,#4C1D95 60%,#7C3AED 100%)" },
      },
    },
    {
      template: Bullet,
      props: {
        step: "01",
        heading: "Depender de una GUI",
        body: "Si tu flujo necesita clicks, no es automatizable. Define el diseño en código.",
        background: { color: "#0A0A0A" },
      },
    },
    {
      template: Bullet,
      props: {
        step: "02",
        heading: "No fijar las fuentes",
        bullets: [
          "Embebe las fuentes en el render",
          "Resultado idéntico en cualquier máquina",
          "Nada de fuentes del sistema",
        ],
        background: { color: "#0A0A0A" },
      },
    },
    {
      template: Quote,
      props: {
        quote: "Automatiza el diseño, no solo la publicación.",
        author: "Carrusel",
        background: { gradient: "linear-gradient(135deg,#0F172A 0%,#1E293B 100%)" },
      },
    },
    // Ejemplo con fondo generado por IA (descomenta y exporta OPENAI_API_KEY):
    // {
    //   template: Cover,
    //   props: {
    //     title: "Empieza hoy",
    //     subtitle: "npm run generate carousels/ejemplo.ts",
    //     background: { ai: "degradado abstracto morado y azul, formas suaves, minimalista", overlay: 0.45 },
    //   },
    // },
  ],
};

export default carousel;
