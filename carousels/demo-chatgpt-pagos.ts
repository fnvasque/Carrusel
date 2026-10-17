import { Hook, Lead, Screen, Step, Cta } from "../src/templates/index.ts";
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
        title: "ChatGPT te recuerda pagar la luz",
        highlight: "te recuerda",
        subtitle: "Gratis, cada mes, sin apps nuevas",
        narracion: "ChatGPT te recuerda pagar la luz, solo, cada mes.",
      },
    },
    {
      template: Lead,
      props: {
        kicker: "Tareas de ChatGPT",
        text: "Le escribes una vez y no lo vuelves a pensar.",
        highlight: "una vez",
        narracion: "Se llama Tareas. Le escribes una vez y listo.",
      },
    },
    {
      template: Screen,
      props: {
        index: 3,
        total: 5,
        app: "ChatGPT",
        prompt: "Avísame cada 1 del mes a las 9: pagar la luz",
        respuesta: "Listo. Te recordaré pagar la luz el día 1 de cada mes a las 9:00.",
        narracion: "Escribes esto, y ChatGPT contesta que ya quedó programado.",
      },
    },
    {
      template: Step,
      props: {
        index: 4,
        total: 5,
        step: "3",
        heading: "Te llega el aviso solo",
        highlight: "solo",
        body: "Al celular o al correo, el día que dijiste.",
        narracion: "El día uno te llega el aviso, sin abrir nada.",
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
