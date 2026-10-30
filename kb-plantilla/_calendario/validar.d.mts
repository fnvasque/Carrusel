export declare const CATALOGO: Record<string, { required: string[]; optional: string[] }>;
export declare const PLANTILLAS: Set<string>;
export declare const EJEMPLO: { plan: any; borrador: any };
export declare function aUtc(dia: string, hora: string, zona?: string): Date;
export declare function normalizar(s: string): string;
export type Ritmo = "ensenar" | "rapido" | "gancho";
export declare function segundosEscena(props: Record<string, unknown>, hold: boolean, pace?: Ritmo, hook?: boolean): number;
export declare function segundosEscenas(slides: unknown[], pace?: Ritmo): number[];
export declare function duracionReel(borrador: unknown): number;
export declare function ritmoDelBorrador(borrador: unknown): Ritmo;
export declare function erroresDeRetencion(borrador: unknown, pieza: unknown, config: unknown): string[];
export declare const DESDE_PALANCAS_RETENCION: string;
export declare function validarConfig(config: unknown): string[];
export declare function validarPlan(plan: unknown, config: unknown): string[];
export declare function validarPieza(pieza: unknown, config: unknown): string[];
export declare function validarBorrador(pieza: unknown, borrador: unknown, config: unknown): string[];
export declare function reglasDeTexto(borrador: unknown, config: unknown, formato?: "reel" | "carrusel", dia?: string): string[];
export declare const MITO_REALIDAD_MAX_PALABRAS: number;
export declare const DESDE_MITO_CORTO: string;
export declare const CONCEPTO_MAX_PALABRAS: { titulo: number; idea: number; enSimple: number; contraste: number };
export declare const CONCEPTO_LAMINA_MAX_PALABRAS: number;
export declare const CONCEPTO_POR_PIEZA: [number, number];
export declare const VARIANTES: string[];
export declare function semanaExplicativa(lunes: string, config: unknown): boolean;
export declare function contarFondosIA(borradores: unknown[]): number;
export declare function contarHookVideo(borradores: unknown[]): number;
export declare function contarClips(borradores: unknown[]): number;
export declare function validarCaption(caption: string, config: unknown, tema?: string, dia?: string): string[];
export declare function ctaDe(config: unknown): { palabra: string; desde: string } | null;
export declare function contienePalabraCta(texto: string, palabra: string): boolean;
export declare const DESDE_CONFUSORES: string;
export declare function confusoresDelExperimento(
  plan: unknown,
  borradores?: Map<string, unknown>,
): { confusores: { clave: string; experimento: string[]; control: string[] }[]; sinControl: boolean; sinContraste: boolean };
export declare function validarSemana(
  dir: string,
  config: unknown,
  opts?: { score?: (borrador: unknown) => number | undefined; avisos?: string[]; raiz?: string | null },
): string[];
export declare function erroresDeOrigen(pieza: unknown, raiz: string): string[];
export declare function textosLector(borrador: unknown, formato?: "reel" | "carrusel"): { completo: string; conPrisa: string };
export declare function textoPastilla(cta?: string): string;
export declare function mensajeLector(seccionLector: string, perfil: "completo" | "conPrisa", texto: string): string;
export declare function seccionDelLector(md: string): string | undefined;
export declare const DESDE_REFERENCIAS: string;
export declare const REFERENCIA_MAX_DIAS: number;
export declare function claveTema(t: string): string;
export declare function motivoReferenciaNoLista(text: string, tema: string, semana: string): string | undefined;
export declare function leerAlcance(raiz: string): { dentro: Set<string>; despues: Set<string>; fuera: Set<string> } | undefined;
export declare function erroresDeReferencias(pieza: unknown, raiz: string, semana: string, alcance?: ReturnType<typeof leerAlcance>): string[];
export declare function validarCandidatos(data: unknown, semana: string, alcance?: ReturnType<typeof leerAlcance>): string[];
export declare function segundosNarracion(texto: unknown): number | undefined;
export interface FilaPrueba { semana: string; id: string; publicada: boolean; ganadora: boolean; errores: string[] }
export interface ResultadoPrueba {
  semanas: string[];
  piezas: number;
  publicadas: number;
  ganadoras: number;
  rechazadas: FilaPrueba[];
  liberadas: FilaPrueba[];
  errores: string[];
}
export declare function probarRegla(
  dir: string,
  configActual: unknown,
  configCandidata: unknown,
  opts?: { validarCandidato?: (dir: string, config: unknown, opts?: object) => string[]; ganadoras?: string[]; score?: (borrador: unknown) => number | undefined },
): ResultadoPrueba;
export declare function ganadorasDeBucle(bucle: unknown): string[];
export declare function informePrueba(r: ResultadoPrueba): string;
export declare const DESDE_CALIDAD: string;
export declare const PATRONES_HOOK: string[];
export declare function erroresDeHookJuez(p: object, borrador?: object, config?: unknown): string[];
export declare function erroresDeHookBorrador(p: object, borrador: object): string[];
export declare function titulosLargos(cands: unknown, config?: unknown): string[];
export declare const DESDE_PROMESAS: string;
export declare function erroresDePromesas(promesas: unknown): string[];
export declare const NADA_NUEVO_RE: RegExp[];
export declare function mensajeJuez(seccion: string, candidatos: object[]): string;
export declare function seccionDelJuez(md: string): string | undefined;
export declare const SERIES_CALIDAD: string[];
export declare function seriesDe(config: unknown): string[];
export declare const SEMANAS_PAQUETE: string[];
export declare const MOTIVO_PAQUETE: string;
