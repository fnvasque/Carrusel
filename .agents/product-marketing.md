# Product Marketing Context

*Last updated: 2026-06-29 — V1 auto-draft (revisar/completar con el fundador)*

## Product Overview
**One-liner:** El filtro en español que explica la IA sin hype y aplicada a tu vida.
**What it does:** Cuenta de IG + newsletter que traduce el ruido de IA en "qué se lanzó, por qué te importa y cómo lo aplicas hoy", en ~30 segundos. El producto interno (`carrusel`/remix) genera los carruseles y Reels de marca por código a partir de posts de referencia.
**Product category:** Medio/creador de contenido de IA en español (educación práctica de IA). En el feed compite por el "shelf" de *cuentas de IA*.
**Product type:** Marca de contenido (audiencia → newsletter como activo propio).
**Business model:** Atención gratis en IG → conversión a newsletter (audiencia propia); monetización futura sobre esa base.

## Target Audience
**Target companies:** N/A (B2C/creador). Audiencia LatAm + España hispanohablante.
**Decision-makers:** El propio consumidor de contenido.
**Primary use case:** "No quedarme atrás en IA sin tener que leer 20 newsletters en inglés ni caer en el hype."
**Jobs to be done:**
- Enterarme de lo que importa en IA **filtrado y en mi idioma** (ahorro de tiempo + FOMO controlado).
- Aprender a **aplicar** una herramienta/prompt hoy, no teoría.
- Sentirme **al día y capaz** frente a la ola de IA (estatus/seguridad).
**Use cases:** scroll de feed → guardar un carrusel "para probarlo después" → compartirlo → suscribirse al correo.

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| **Andrea, 31, marketing en una pyme** (ICP) | Resultados prácticos, no quedar obsoleta, ahorrar tiempo | Abrumación/FOMO: demasiada IA, casi toda en inglés y con hype | "En 30 s: qué salió, por qué te importa, cómo lo usas hoy — sin hype" |

## Problems & Pain Points
**Core problem:** Sobrecarga de información de IA + barrera de idioma + desconfianza por el hype.
**Why alternatives fall short:**
- Las grandes cuentas de IA están **en inglés** (hueco en español).
- El resto del feed hispano es **hype cripto-bro** ("hazte rico con IA"), **miedo** ("te reemplazan") o **clickbait que no cumple**.
**What it costs them:** Tiempo perdido, decisiones mal informadas, ansiedad de "me estoy quedando atrás".
**Emotional tension:** FOMO + sensación de incompetencia/abrumación.

## Competitive Landscape
**Direct:** Cuentas de IA en español (la "marea") — caen en hype/miedo/clickbait, diseño genérico y plantillas Canva intercambiables; no construyen confianza ni activo propio.
**Secondary:** Cuentas de IA en inglés (top global) — mejores, pero barrera de idioma y contexto LatAm.
**Indirect:** Newsletters/medios de IA, YouTube, "preguntarle a ChatGPT directamente".
**Cómo se quedan cortas:** ninguna ocupa el espacio "filtro confiable, en español, anti-hype, con identidad visual reconocible".

## Differentiation
**Key differentiators:**
- **Anti-hype con sistema** (gate de marca que penaliza hype/miedo/jerga/clickbait — está en el código: `src/score/virality.ts`).
- **En español neutro/chileno**, contexto LatAm.
- **Identidad visual propia y consistente** (navy+cian, Anton, editorial) generada por código → repetible y reconocible (vs. plantillas Canva random).
- **Aplicable hoy** (prompts/pasos usables), no teoría.
**How we do it differently:** un formato fijo y una voz fija ("qué/por qué/cómo en 30 s") + un sistema visual con tokens.
**Why that's better:** consistencia = reconocimiento de marca en el feed = confianza = suscripción.
**Why customers choose us:** ahorra tiempo, no insulta su inteligencia, y se ve serio/confiable.

## Objections
| Objection | Response |
|-----------|----------|
| "Otra cuenta de IA más" | Identidad visual reconocible + anti-hype con formato fijo: se nota distinta al primer slide |
| "¿Por qué darte mi correo?" | "Lo bueno (lo aplicable) va al correo, cada semana, sin spam ni hype" |
| "El inglés tiene más/mejor" | Filtrado, traducido y contextualizado para ti — sin la barrera del idioma |

**Anti-persona:** el cazador de hype "hazte rico con IA"; el técnico avanzado que quiere papers/jerga profunda.

## Switching Dynamics
**Push:** abrumación, hype que cansa, contenido en inglés.
**Pull:** "por fin alguien lo explica claro, en español y sin venderme humo".
**Habit:** seguir a cuentas grandes en inglés / ignorar el tema.
**Anxiety:** "¿será otra cuenta de relleno?" → la resuelve la **consistencia visual + cumplir la promesa** del primer carrusel.

## Customer Language
**How they describe the problem:**
- "Hay demasiada IA, no sé qué es importante."
- "Todo está en inglés."
- "Puro humo / puro vende-cursos."
**How they describe us (aspiracional):**
- "La cuenta que me explica la IA sin marearme."
**Words to use:** aplícalo hoy, en 30 segundos, sin hype, qué/por qué/cómo, guárdalo, gratis.
**Words to avoid:** hazte rico, te reemplazan/quedas obsoleto, revolucionario/brutal/increíble, jerga cruda (LLM, token, embedding) sin explicar, "no vas a creer".
**Glossary:**
| Term | Meaning |
|------|---------|
| Pilar | Tipo de contenido: Herramienta / Noticia / Prompt / Curiosidad |
| Remix | Tomar un post de referencia → 2 variaciones de marca |
| Gate de viralidad | Score que exige las palancas de guardado/compartido antes de publicar |

## Brand Voice
**Tone:** cercano, claro, seguro; "amigo experto que te ahorra el ruido".
**Style:** directo, conversacional, concreto; segunda persona ("tú/te"); cero relleno.
**Personality:** confiable · sin hype · práctico · en tu idioma · con criterio.

## Proof Points
**Metrics:** (pendiente) — guardados/compartidos por 1k de alcance; suscriptores al correo. Hay bucle de calibración predicho↔real en el código.
**Value themes:**
| Theme | Proof |
|-------|-------|
| Anti-hype con sistema | Gate de marca en código que penaliza hype/miedo/jerga/clickbait |
| Consistencia de marca | Sistema visual por tokens (navy+cian, Anton/Inter), no plantillas random |
| Aplicable hoy | Plantillas Prompt/Step con acción usable |

## Goals
**Business goal:** construir audiencia propia (newsletter) confiable en español.
**Conversion action:** guardar/compartir el carrusel → suscribirse al correo.
**Current metrics:** (pendiente de completar).
