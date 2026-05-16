/**
 * Quick smoke test for the Mistral Pixtral QA module.
 *
 * Usage:
 *   MISTRAL_API_KEY=... node lib/test-qa.mjs [slide-png-path]
 *
 * Defaults to ../test-output/slide-02.png (the Notion slide from the
 * end-to-end test). Prints the structured QA result.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { qaSlide } from "./qa.js";

const target = process.argv[2] ?? resolve(import.meta.dirname, "..", "test-output", "slide-02.png");

const pngBytes = await readFile(target);
console.log(`→ QA-ing ${target} (${pngBytes.length} bytes)`);

const result = await qaSlide({
  pngBytes,
  slideIndex: 2,
  model: "pixtral-12b-2409",
});

console.log(JSON.stringify(result, null, 2));
