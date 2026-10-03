export declare const TIPOS: Set<string>;
export declare function parseFrontmatter(
  text: string,
): { data: Record<string, string | string[]>; body: string } | { error: string };
export declare function validateReferencia(text: string): string[];
export declare function validateTopicBlock(text: string): string[];
export declare function validateResumen(text: string): string[];
export declare function outsideAgentZones(paths: string[]): string[];
export declare function autoZoneOf(text: string): string | undefined;
