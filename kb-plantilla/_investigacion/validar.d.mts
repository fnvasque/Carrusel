export declare const TIPOS: Set<string>;
export declare function parseFrontmatter(
  text: string,
): { data: Record<string, string | string[]>; body: string } | { error: string };
export declare function validateReferencia(text: string, ctx?: Contexto): string[];
export declare function validateTopicBlock(text: string): string[];
export declare function validateResumen(text: string): string[];
export declare function outsideAgentZones(paths: string[]): string[];
export declare function autoZoneOf(text: string): string | undefined;
export declare function parseNameStatus(out: string): { status: string; path: string }[];
export declare function zoneErrors(changes: { status: string; path: string }[]): string[];
export declare const DESDE_AUDIENCIA: string;
export declare const ROTULOS_AUDIENCIA: string[];
export declare const DESDE_NOVEDAD: string;
export declare const ROTULO_NOVEDAD: string;
export declare function seccion(body: string, titulo: string): string | undefined;
export declare function validateAudiencia(body: string, revisado?: string): string[];
export declare function validateAlcance(text: string): string[];
export declare function claveTema(t: string): string;
export declare const DESDE_ETAPAS: string;
export declare const ETAPAS: string[];
export declare const ROTULO_DICHO: string;
export declare const ROTULO_EMPIEZA: string;
export declare const ROTULOS_ETAPAS: string[];
export declare const MAX_DICHO: number;
export declare const META_REFERENCIAS: number;
export declare const META_CONEXIONES: number;
export type Contexto = { etapas?: string[]; slugs?: Set<string>; preguntas?: string[]; slugPropio?: string; fuentesDe?: Map<string, string[]> };
export declare function slugDeEnlace(s: string): string;
export declare function dichoSimple(body: string): string | undefined;
export declare function parsePreguntas(text: string): string[];
export declare function lineasPreguntas(text: string): { validas: string[]; invalidas: string[] };
export declare function contexto(root: string): Contexto;
export declare function cobertura(
  root: string,
  hoy: string,
): { etapas: { etapa: string; referencias: number; conexiones: number; falta: boolean }[]; preguntasPendientes: string[]; preguntasInvalidas: string[] };
export declare function mensajeAprendiz(nota: string, lector: string): string;
