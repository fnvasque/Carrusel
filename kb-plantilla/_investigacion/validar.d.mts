export declare const TIPOS: Set<string>;
export declare function parseFrontmatter(
  text: string,
): { data: Record<string, string | string[]>; body: string } | { error: string };
export declare function validateReferencia(text: string): string[];
export declare function validateTopicBlock(text: string): string[];
export declare function validateResumen(text: string): string[];
export declare function outsideAgentZones(paths: string[]): string[];
export declare function autoZoneOf(text: string): string | undefined;
export declare function parseNameStatus(out: string): { status: string; path: string }[];
export declare function zoneErrors(changes: { status: string; path: string }[]): string[];
export declare const DESDE_AUDIENCIA: string;
export declare const ROTULOS_AUDIENCIA: string[];
export declare function seccion(body: string, titulo: string): string | undefined;
export declare function validateAudiencia(body: string): string[];
export declare function validateAlcance(text: string): string[];
export declare function claveTema(t: string): string;
