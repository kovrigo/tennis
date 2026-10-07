import { rmSync } from "node:fs";
import { join } from "node:path";

// Vitest global setup: the folders tests made under tmp/test/ go when the run ends.

export function teardown(): void {
  rmSync(join(import.meta.dirname, "..", "tmp", "test"), { recursive: true, force: true });
}
