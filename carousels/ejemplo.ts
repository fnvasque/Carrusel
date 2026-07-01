import { Hook, Lead, Step, Cta } from "../src/templates/index.ts";
import type { CarouselSpec } from "../src/templates/types.ts";

/**
 * Carrusel gold-standard (pilar Noticia). Cópialo para crear los tuyos.
 *
 * Sigue la anatomía de marca: Hook (stop-scroll, palabra clave en cian) → Lead
 * (promesa, baja la ansiedad) → Step 01/02/03 (1 idea por slide, con progreso)
 * → Cta (funnel al newsletter). El copy respeta las reglas: sin hype, sin jerga,
 * sin clickbait; siempre "qué hago yo con esto".
 *
 * Todos los slides comparten el pilar (color del chip) vía `defaults`. La
 * superficie por defecto es la de marca (crema editorial clara, la pinta `Frame`):
 * NO fijes fondos oscuros. Bajo la identidad clara el texto es tinta oscura, así
 * que un `background` oscuro rompería el contraste. Los únicos overrides válidos
 * son fotográficos, con scrim claro automático:
 *   { ai: "una persona usando el móvil en una oficina", overlay: 0.5 }
 *     → se le anexa automáticamente el estilo visual de marca (requiere OPENAI_API_KEY).
 *   { image: "ruta/local.png", overlay: 0.5 }
 */
const carousel: CarouselSpec = {
  name: "ejemplo",
  // Pilar de la pieza → color del chip. Se aplica a todos los slides.
  defaults: { pillar: "noticia" },
  slides: [
    {
      template: Hook,
      props: {
        eyebrow: "Qué se lanzó",
        title: "El nuevo ChatGPT ahora ve imágenes",
        highlight: "ve imágenes",
        subtitle: "Te lo explico en 30 segundos.",
      },
    },
    {
      template: Lead,
      props: {
        kicker: "En 30 segundos",
        text: "En 1 frase: le mandas una foto o un pantallazo y te responde sobre ella.",
        highlight: "foto o un pantallazo",
      },
    },
    {
      template: Step,
      props: {
        index: 3,
        total: 6,
        step: "01",
        heading: "Qué cambió",
        highlight: "cambió",
        body: "Antes solo leía texto. Ahora entiende imágenes: gráficos, recibos, pantallazos de tu trabajo.",
      },
    },
    {
      template: Step,
      props: {
        index: 4,
        total: 6,
        step: "02",
        heading: "Por qué te importa",
        highlight: "importa",
        body: "Le pasas el pantallazo de un informe y le pides que te lo resuma. Adiós a transcribir a mano.",
      },
    },
    {
      template: Step,
      props: {
        index: 5,
        total: 6,
        step: "03",
        heading: "Hazlo hoy",
        highlight: "hoy",
        body: "Abre ChatGPT, súbele una foto de tus notas de una reunión y pídele 3 conclusiones.",
        source: "Fuente: OpenAI",
      },
    },
    {
      template: Cta,
      props: {
        title: "Lo que importa en IA, en tu correo",
        highlight: "tu correo",
        reason: "Cada semana. Sin hype.",
        handle: "ia.punto.es",
      },
    },
  ],
};

export default carousel;
