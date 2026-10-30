import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const apiKey = process.env.METAKEY ?? process.env.MODEL_API_KEY;
if (!apiKey) throw new Error("Set METAKEY in the repo root .env");

export const meta = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey });

export const MODELS = {
  spark: "muse-spark-1.3",
  sam: "sam-3.1",
  asr: "muse-voice-transcribe-1.0",
} as const;

export const API_KEY = apiKey;

export const jpegDataUrl = (buf: Buffer) => `data:image/jpeg;base64,${buf.toString("base64")}`;
