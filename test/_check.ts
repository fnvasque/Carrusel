/**
 * Arnés mínimo de tests offline (mismo estilo que test/smoke.ts): `check` para
 * casos síncronos, `checkAsync` para async y `done()` al final, que espera los
 * pendientes, imprime el resumen y sale con código ≠ 0 si algo falló.
 */
let passed = 0;
let failed = 0;
const pending: Promise<void>[] = [];

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

/** Igual que `check`, para casos async. Se registra y `done()` lo espera. */
export async function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  const p = (async () => {
    try {
      await fn();
      passed++;
      console.log("✓", name);
    } catch (e) {
      failed++;
      console.error("✗", name, "—", e instanceof Error ? e.message : e);
    }
  })();
  pending.push(p);
  await p;
}

export async function done(): Promise<void> {
  await Promise.all(pending);
  console.log(`\n${passed} ok, ${failed} fallos`);
  if (failed > 0) process.exit(1);
}
