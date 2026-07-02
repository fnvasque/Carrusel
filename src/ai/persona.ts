/**
 * Persona objetivo de la marca ia.es — fuente ÚNICA de verdad. La usan TANTO el
 * generador de variaciones (`analyze.ts`, para escribir PARA ella) como el
 * evaluador de valor (`evaluate.ts`, para juzgar como ella). Mismo texto en ambos
 * lados: el generador y el juez apuntan a la misma persona.
 */
export const ANDREA = `
Eres "Andrea": 31 años, trabajas en marketing en una pyme en Latinoamérica. NO eres técnica.
Sigues cuentas de IA porque temes quedarte atrás, pero el ruido y el FOMO te abruman.
De un carrusel de IA quieres, en ~30 segundos: QUÉ pasó, POR QUÉ te importa y CÓMO lo aplicas HOY en tu trabajo.
Detestas: el hype ("cambia tu vida", "increíble"), el miedo ("te van a reemplazar"), la jerga sin explicar
(LLM, token, embedding) y el clickbait que no cumple lo que promete.
Guardas o compartes SOLO lo que te deja algo usable hoy o te hace quedar bien con un colega.
Eres honesta y algo escéptica: si algo es humo o relleno, lo dices.
`.trim();

/**
 * Reencuadre de un tema al mundo de Andrea: cómo un/a marketer de pyme aplica ESTE
 * tema en su trabajo. Lo deriva `deriveAudienceAngle` del análisis del post y ancla
 * TODA la generación (todas las variaciones se escriben desde aquí).
 */
export interface AudienceAngle {
  /** El ángulo en 1 frase: cómo Andrea usa este tema. */
  angle: string;
  /** El "job to be done" concreto que le resuelve a Andrea. */
  jobToBeDone: string;
  /** 2-4 usos concretos en marketing de pyme. */
  useCases: string[];
  /** Qué del post original NO le sirve a Andrea y hay que soltar. */
  drop: string[];
}

/** Bloque de prompt (puro, testeable) con el ángulo para inyectar en la generación. */
export function formatAngle(a: AudienceAngle): string {
  const list = (xs: string[]) => (xs.length ? xs.join(" · ") : "(—)");
  return [
    "ÁNGULO PARA LA AUDIENCIA (Andrea) — escribe TODAS las variaciones DESDE aquí,",
    "reencuadrando el tema a SU trabajo (marketing en pyme). NO traduzcas el post original tal cual.",
    `- Ángulo: ${a.angle || "(—)"}`,
    `- Lo que Andrea logra: ${a.jobToBeDone || "(—)"}`,
    `- Casos de uso (marketing pyme): ${list(a.useCases)}`,
    `- Suelta del original (no le sirve): ${list(a.drop)}`,
    "Cada slide de desarrollo debe responder la pregunta de Andrea: ¿esto cómo lo APLICO HOY en mi trabajo?",
    "Ejemplos y prompts en contexto de marketing de pyme.",
  ].join("\n");
}
