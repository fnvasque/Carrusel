/**
 * Mini arnés de pruebas compartido (misma lógica que `test/smoke.ts`): cada caso
 * suma un ok o un fallo, y `done()` imprime el resumen y sale con 1 si algo falló.
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

/** Imprime `N ok, M fallos` y termina el proceso (exit 1 si hubo fallos). */
export function done(): never {
  console.log(`\n${passed} ok, ${failed} fallos`);
  process.exit(failed ? 1 : 0);
}
