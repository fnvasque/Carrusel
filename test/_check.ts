/**
 * Arnés mínimo de tests (misma lógica que `test/smoke.ts`): cada archivo de
 * `test/<grupo>/*.ts` registra sus casos con `check`/`checkAsync` al importarse
 * y el runner llama a `done()`, que imprime el total y sale con 1 si algo falló.
 */
let passed = 0;
let failed = 0;

export function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log("✓", name);
  } catch (e) {
    failed++;
    console.error("✗", name, "—", e instanceof Error ? e.message : e);
  }
}

/** Igual que `check`, para casos async (se esperan con `await` en el top-level). */
export async function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log("✓", name);
  } catch (e) {
    failed++;
    console.error("✗", name, "—", e instanceof Error ? e.message : e);
  }
}

/** Imprime los totales y sale con código 1 si hubo fallas. */
export function done(): void {
  console.log(`\n${passed} ok, ${failed} fallos`);
  if (failed > 0) process.exit(1);
}
