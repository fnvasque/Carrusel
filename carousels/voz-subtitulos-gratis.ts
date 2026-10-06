import { Hook, Lead, Step, Prompt, Stat, MythReality, Cta } from "../src/templates/index.ts";
import type { CarouselSpec } from "../src/templates/types.ts";

/**
 * Subtitula y narra gratis, en local. Pilar Herramienta. Fuentes:
 * knowledge/referencias/whisper.md y kokoro.md (revisado 2026-10-03): Whisper MIT,
 * `turbo` ~8× más rápido que large, ~6 GB de VRAM, requiere ffmpeg; `whisper-1`
 * de la API se apaga el 2027-02-26 (OpenAI sugiere gpt-transcribe). Kokoro-82M
 * Apache-2.0, 1 voz femenina y 2 masculinas en español (lang_code 'e').
 * Reescrito según docs/auditoria/2026-10-05-auditoria-carruseles.md.
 */
const carousel: CarouselSpec = {
  name: "voz-subtitulos-gratis",
  pace: "ensenar",
  defaults: { pillar: "herramienta" },
  slides: [
    {
      template: Hook,
      props: {
        eyebrow: "Herramientas open source",
        title: "Subtitula y narra gratis, sin salir de tu PC",
        highlight: "gratis",
        mark: "tu PC",
        subtitle: "Whisper y Kokoro, en local. Te dejo los comandos.",
      },
    },
    {
      template: Lead,
      props: {
        index: 2,
        total: 8,
        kicker: "En una frase",
        text: "Whisper convierte tu audio en texto. Kokoro convierte texto en voz.",
        highlight: "texto",
      },
    },
    {
      template: Step,
      props: {
        index: 3,
        total: 8,
        step: "01",
        heading: "Whisper: audio a subtítulos",
        highlight: "subtítulos",
        bullets: [
          "De OpenAI, licencia MIT: uso libre",
          "Modelo turbo: ~8× más rápido que large",
          "Pide ~6 GB de VRAM y ffmpeg instalado",
        ],
        source: "Fuente: github.com/openai/whisper",
      },
    },
    {
      template: Prompt,
      props: {
        index: 4,
        total: 8,
        heading: "Subtitula así",
        prompt: "pip install -U openai-whisper\nwhisper audio.mp3 --model turbo",
        note: "Cambia audio.mp3 por tu archivo.",
      },
    },
    {
      template: Stat,
      props: {
        index: 5,
        total: 8,
        value: "3",
        label: "voces en español en Kokoro: 1 femenina y 2 masculinas",
        context: "Modelo de voz pequeño (82M de parámetros), licencia Apache-2.0. Corre en local.",
        source: "Fuente: github.com/hexgrad/kokoro",
      },
    },
    {
      template: Prompt,
      props: {
        index: 6,
        total: 8,
        heading: "Instala Kokoro así",
        prompt: "pip install \"kokoro>=0.9.4\" soundfile\n\n# en Python:\nfrom kokoro import KPipeline\npipeline = KPipeline(lang_code='e')",
        note: "lang_code='e' es español. La voz se elige en VOICES.md del repo.",
      },
    },
    {
      template: MythReality,
      props: {
        index: 7,
        total: 8,
        myth: "Whisper desaparece en 2027.",
        reality: "Solo whisper-1 de la API. El local sigue.",
        source: "Retiro: 26-02-2027. OpenAI sugiere gpt-transcribe. Fuente: OpenAI",
      },
    },
    {
      template: Cta,
      props: {
        title: "Guárdalo y pruébalo hoy",
        highlight: "Guárdalo",
        reason: "Los comandos para subtitular y narrar, listos para copiar.",
        cta: "Guardar",
        handle: "ia.punto.es",
      },
    },
  ],
};

export default carousel;
