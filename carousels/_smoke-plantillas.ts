import { Hook, Lead, Step, Stat, Prompt, Screen, MythReality, Cta } from "../src/templates/index.ts";
import type { CarouselSpec } from "../src/templates/types.ts";

/**
 * Carrusel de prueba (smoke) para ejercitar las 7 plantillas de marca con el
 * look lima por defecto. No es el gold-standard; sirve para verificar el
 * render de todas las plantillas en una pasada.
 */
const carousel: CarouselSpec = {
  name: "_smoke-plantillas",
  slides: [
    {
      template: Hook,
      props: { app: "ChatGPT", modo: "aviso", resultado: "Recordatorio: pagar la luz. Hoy, 9:00.",
        pillar: "noticia",
        eyebrow: "Qué se lanzó",
        title: "OpenAI acaba de cambiar cómo trabajas",
        highlight: "cambiar",
        mark: "trabajas",
        subtitle: "Te lo explico en 30 segundos.",
      },
    },
    {
      template: Lead,
      props: { pillar: "noticia", kicker: "En 30 segundos", text: "En 1 frase: ahora entiende imágenes y responde al instante.", highlight: "imágenes" },
    },
    {
      template: Step,
      props: { pillar: "noticia", index: 3, total: 7, step: "01", heading: "Qué cambió", highlight: "cambió", body: "Antes solo leía texto. Ahora entiende fotos y pantallazos.", bullets: ["Le mandas una imagen", "Responde al instante"] },
    },
    {
      template: Stat,
      props: {
        pillar: "noticia",
        index: 4,
        total: 7,
        value: "47%",
        label: "del valor de un video puede llegar en 3 segundos",
        context: "Por eso lo primero que se ve tiene que ser la promesa.",
        source: "Fuente: Meta / Nielsen",
      },
    },
    {
      template: Prompt,
      props: { pillar: "prompt", index: 5, total: 7, heading: "Resume cualquier reunión", prompt: "Pega aquí la transcripción y escribe:\n\"Resúmelo en 5 puntos para un cliente.\"", note: "Funciona gratis en ChatGPT." },
    },
    {
      template: MythReality,
      props: { pillar: "curiosidad", index: 6, total: 7, myth: "La IA piensa y decide sola.", reality: "Hace lo que tú le pides. Tú revisas y decides." },
    },
    {
      template: Screen,
      props: { pillar: "herramienta", index: 7, total: 8, app: "ChatGPT", prompt: "Avísame cada 1 del mes: pagar la luz", respuesta: "Listo. Te recordaré pagar la luz el día 1 de cada mes a las 9:00.", nota: "Tareas de ChatGPT, gratis.", narracion: "Le escribes esto una vez y te lo recuerda todos los meses." },
    },
    {
      template: Cta,
      props: { title: "Lo que importa en IA, en tu correo", highlight: "tu correo", reason: "Cada semana. Sin hype.", handle: "ia.es", showLogo: true },
    },
  ],
};

export default carousel;
