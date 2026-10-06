export declare const CATALOGO: Record<string, { required: string[]; optional: string[] }>;
export declare const PLANTILLAS: Set<string>;
export declare const EJEMPLO: { plan: any; borrador: any };
export declare function normalizar(s: string): string;
export declare function segundosEscena(props: Record<string, unknown>, hold: boolean, pace?: "ensenar" | "rapido", hook?: boolean): number;
export declare function validarConfig(config: unknown): string[];
export declare function validarPlan(plan: unknown, config: unknown): string[];
export declare function validarBorrador(pieza: unknown, borrador: unknown, config: unknown): string[];
export declare function reglasDeTexto(borrador: unknown, config: unknown, formato?: "reel" | "carrusel"): string[];
export declare function contarFondosIA(borradores: unknown[]): number;
export declare function validarCaption(caption: string, config: unknown, tema?: string): string[];
export declare function validarSemana(
  dir: string,
  config: unknown,
  opts?: { score?: (borrador: unknown) => number | undefined; avisos?: string[] },
): string[];
