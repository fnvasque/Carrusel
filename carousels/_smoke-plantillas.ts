import { Hook, Lead, Step, Stat, Prompt, MythReality, Cta } from "../src/templates/index.ts";
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
      props: {
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
        label: "del valor de un video llega en 3 segundos",
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
      template: Cta,
      props: { title: "Lo que importa en IA, en tu correo", highlight: "tu correo", reason: "Cada semana. Sin hype.", handle: "ia.es", showLogo: true },
    },
  ],
};

export default carousel;
