import type { Seed } from "../seed.ts";
import { run001 } from "./001_samples.ts";

// Every seed in run order. A seed that reached staging is never edited: add a new file.
export const seeds: Seed[] = [{ name: "001_samples", run: run001 }];
