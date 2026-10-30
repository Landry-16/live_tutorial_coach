import { z } from "zod";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { meta, MODELS } from "./meta.ts";

type Effort = "minimal" | "low" | "medium" | "high";

// Structured output validated against the zod schema, with one repair attempt (pattern from Sensai).
export async function askJson<S extends z.ZodType>(
  schema: S,
  name: string,
  input: ResponseInputItem[],
  effort: Effort = "minimal",
): Promise<z.infer<S>> {
  const format = { type: "json_schema" as const, name, schema: z.toJSONSchema(schema) as Record<string, unknown> };
  let messages = input;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await meta.responses.create({
      model: MODELS.spark,
      reasoning: { effort },
      max_output_tokens: effort === "minimal" ? 4000 : 16000,
      input: messages,
      text: { format },
    });
    let error: string;
    try {
      const parsed = schema.safeParse(JSON.parse(r.output_text));
      if (parsed.success) return parsed.data;
      error = z.prettifyError(parsed.error);
    } catch (e) {
      error = (e as Error).message;
    }
    messages = [
      ...input,
      { role: "assistant", content: r.output_text },
      { role: "user", content: `Your JSON is invalid: ${error}. Answer again with valid JSON only.` },
    ];
  }
  throw new Error(`${name}: invalid JSON after one repair attempt`);
}
