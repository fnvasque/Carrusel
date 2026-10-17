import { Hook, Screen, Cta } from "../src/templates/index.ts";
import type { CarouselSpec } from "../src/templates/types.ts";

/**
 * Demo del formato nuevo (pivote 2026-10-17): reel narrado con la IA en
 * pantalla. Serie "Hazlo con IA en 20 s". Cada escena lleva `narracion`
 * (voz Kokoro em_alex + subtítulo) y la escena Screen muestra ChatGPT
 * recibiendo el prompt y contestando.
 *
 *   npm run reel carousels/demo-chatgpt-pagos.ts -- --pace=gancho --audio=promo/audio/digital-clouds.mp3
 */
const carousel: CarouselSpec = {
  name: "demo-chatgpt-pagos",
  pace: "gancho",
  defaults: { pillar: "herramienta" },
  slides: [
    {
      template: Hook,
      props: {
        title: "ChatGPT te avisa solo",
        highlight: "solo",
        app: "ChatGPT",
        modo: "aviso",
        resultado: "Recordatorio: pagar la luz. Hoy, 9:00.",
        narracion: "Este aviso lo manda ChatGPT solo, cada mes. Mira cómo se hace.",
      },
    },
    {
      template: Screen,
      props: {
        index: 2,
        total: 3,
        app: "ChatGPT",
        prompt: "Avísame cada 1 del mes a las 9: pagar la luz",
        respuesta: "Listo. Te recordaré pagar la luz el día 1 de cada mes a las 9:00.",
        narracion: "Le escribes esto una sola vez, y te contesta que ya quedó programado. El día uno te llega el aviso, sin abrir nada.",
      },
    },
    {
      template: Cta,
      props: {
        title: "Mándaselo a quien siempre olvida pagar",
        highlight: "Mándaselo",
        reason: "Funciona en el plan gratis.",
        handle: "ia.punto.es",
        cta: "Envíaselo a alguien",
        source: "Fuente: help.openai.com, Tasks in ChatGPT",
        narracion: "Mándaselo a quien siempre se le pasa la fecha. Es gratis.",
      },
    },
  ],
};

export default carousel;
