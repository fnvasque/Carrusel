/**
 * Arnés mínimo de tests (mismo estilo que test/smoke.ts): cada `check` cuenta
 * y `done()` imprime los totales y sale con código 1 si algo falló.
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

/** Igual que `check`, para casos async (se esperan con `await`). */
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

export function done(): void {
  console.log(`\n${passed} ok, ${failed} fallidos`);
  if (failed > 0) process.exit(1);
}
