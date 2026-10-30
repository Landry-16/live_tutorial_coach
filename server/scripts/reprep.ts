// Re-run the prep pipeline on an uploaded tutorial (reuses its narration transcript).
// Usage: npm run reprep -- <tutorial id>
import { prepare } from "../src/prep.ts";

const id = process.argv[2];
await prepare(id, (s) => console.log(s.state, "stage" in s ? s.stage : "error" in s ? s.error : ""));
