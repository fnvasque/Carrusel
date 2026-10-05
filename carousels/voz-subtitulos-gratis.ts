import { Hook, Lead, Step, Prompt, MythReality, Cta } from "../src/templates/index.ts";
import type { CarouselSpec } from "../src/templates/types.ts";

/**
 * 2 IAs gratis para voz y subtítulos, en local. Pilar Herramienta. Fuentes:
 * knowledge/referencias/whisper.md y kokoro.md (revisado 2026-10-03): Whisper
 * MIT, `turbo` ~8× más rápido que large, requiere ffmpeg; `whisper-1` de la API
 * se apaga el 2027-02-26. Kokoro-82M Apache-2.0, 1 voz femenina y 2 masculinas
 * en español (lang_code 'e').
 */
const BG = { gradient: "linear-gradient(160deg,#0B1020 0%,#151D33 100%)" };

const carousel: CarouselSpec = {
  name: "voz-subtitulos-gratis",
  defaults: { pillar: "herramienta" },
  slides: [
    {
      template: Hook,
      props: {
        eyebrow: "Herramientas open source",
        title: "2 IAs gratis para voz y subtítulos",
        highlight: "gratis",
        subtitle: "Corren en tu computador. Y por qué conviene moverte antes de 2027.",
        background: {
          ai: "a glowing cyan sound waveform turning into lines of subtitle text, floating over a dark navy void, minimalist, generous negative space",
          overlay: 0.62,
        },
      },
    },
    {
      template: Lead,
      props: {
        kicker: "En una frase",
        text: "Transcribes con Whisper y narras con Kokoro, todo en local.",
        highlight: "en local",
        background: BG,
      },
    },
    {
      template: Step,
      props: {
        index: 3,
        total: 7,
        step: "01",
        heading: "Whisper: subtítulos",
        highlight: "subtítulos",
        body: "De OpenAI, open source (MIT). Usa el modelo turbo: es ~8× más rápido que large, con una pérdida mínima de precisión.",
        source: "Fuente: github.com/openai/whisper",
        background: BG,
      },
    },
    {
      template: Prompt,
      props: {
        index: 4,
        total: 7,
        heading: "Pruébalo así",
        prompt: "pip install -U openai-whisper\nwhisper audio.mp3 --model turbo",
        note: "Copia y pega en tu terminal. Necesitas ffmpeg instalado.",
        background: BG,
      },
    },
    {
      template: Step,
      props: {
        index: 5,
        total: 7,
        step: "02",
        heading: "Kokoro: la voz",
        highlight: "voz",
        body: "82M de parámetros, licencia Apache-2.0. Trae 1 voz femenina y 2 masculinas en español: usa lang_code='e'.",
        source: "Fuente: github.com/hexgrad/kokoro",
        background: BG,
      },
    },
    {
      template: MythReality,
      props: {
        index: 6,
        total: 7,
        mythLabel: "Ojo Nº1",
        myth: "La API de Whisper es para siempre.",
        reality: "whisper-1 se apaga en febrero de 2027.",
        source: "Apagado: 26-02-2027. El modelo local no se ve afectado. Fuente: OpenAI",
        background: BG,
      },
    },
    {
      template: Cta,
      props: {
        title: "Guárdalo para tu próximo reel",
        highlight: "Guárdalo",
        reason: "Lo que importa en IA, cada semana en tu correo.",
        handle: "ia.punto.es",
        background: {
          ai: "an abstract half-open mail envelope with cyan light pouring out, navy background",
          overlay: 0.5,
        },
      },
    },
  ],
};

export default carousel;
