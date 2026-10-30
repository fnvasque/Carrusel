import { Hook, Concepto, Cta } from "../src/templates/index.ts";
import type { CarouselSpec } from "../src/templates/types.ts";

/**
 * Carrusel explicativo de ejemplo (plantilla `Concepto`): una idea de IA dicha en
 * simple en 4 láminas, cada una con el problema, la distinción en negrita y,
 * bajo «En simple:», lo que hago yo y la acción. Sirve de muestra visual y de
 * caso real en `test/layout-bounds.ts`.
 */
const carousel: CarouselSpec = {
  name: "ejemplo-explicativo",
  defaults: { pillar: "trabajo" },
  slides: [
    {
      template: Hook,
      props: { title: "4 cosas de la IA que nadie te explica en simple", highlight: "en simple", subtitle: "Lo que me habría gustado saber el primer día" },
    },
    {
      template: Concepto,
      props: {
        numero: "1",
        titulo: "La IA no sabe quién eres",
        highlight: "quién eres",
        idea: "Le pides algo y te responde genérico, como si le hablara a cualquiera.",
        contraste: "Sin contexto, responde para cualquiera. Con contexto, responde para ti.",
        enSimple: "Yo parto cada conversación contándole mi cargo, mi equipo y para qué lo necesito. Pídele lo mismo hoy: tres líneas sobre ti antes de la pregunta.",
      },
    },
    {
      template: Concepto,
      props: {
        numero: "2",
        titulo: "El primer borrador no es el final",
        highlight: "borrador",
        idea: "Te entrega algo a medias y piensas que no sirve para tu trabajo.",
        enSimple: "Yo le respondo como a un colega: «más corto», «más cercano», «sin la tercera parte». Escribe qué cambiarías y pide otra versión.",
      },
    },
    {
      template: Concepto,
      props: {
        numero: "3",
        titulo: "Pregúntale cómo ayudarte",
        highlight: "cómo ayudarte",
        idea: "No sabes qué pedirle, así que no le pides nada.",
        contraste: "No necesitas saber qué pedirle. Necesitas contarle qué haces.",
        enSimple: "Yo le escribí: «Soy jefe de área. ¿En qué tareas de mi semana me puedes ayudar?». Copia esa pregunta con tu cargo y elige una de su lista.",
      },
    },
    {
      template: Concepto,
      props: {
        numero: "4",
        titulo: "Suena segura aunque se equivoque",
        highlight: "se equivoque",
        idea: "A veces inventa un dato y lo dice con la misma seguridad que uno cierto.",
        enSimple: "Yo reviso cifras, nombres y fechas antes de mandar algo. Pídele que te marque lo que no está segura de saber.",
        source: "Fuente: guías de uso de OpenAI y Anthropic",
      },
    },
    {
      template: Cta,
      props: { title: "¿No sabes por dónde empezar con la IA en tu trabajo?", highlight: "empezar", cta: "Escríbeme PARTIR", reason: "Te ayudo a dar el primer paso." },
    },
  ],
};

export default carousel;
