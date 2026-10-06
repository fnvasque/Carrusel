/**
 * Mini arnés de pruebas compartido (misma lógica que test/smoke.ts): `check` para casos
 * síncronos, `checkAsync` para async y `done()` al final (espera los async pendientes,
 * imprime `N ok, M fallos` y sale con código 1 si algo falló).
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

/** Igual que `check`, para casos async. Se ejecutan en orden de registro; `done()` los espera. */
export function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  const prev = pending[pending.length - 1] ?? Promise.resolve();
  const p = prev.then(async () => {
    try {
      await fn();
      passed++;
      console.log("✓", name);
    } catch (e) {
      failed++;
      console.error("✗", name, "—", e instanceof Error ? e.message : e);
    }
  });
  pending.push(p);
  return p;
}

export async function done(): Promise<void> {
  await Promise.all(pending);
  console.log(`\n${passed} ok, ${failed} fallos`);
  process.exit(failed ? 1 : 0);
}
