import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TutorialSchema, type TutorialStatus } from "../../shared/contracts.ts";

export const DATA_DIR = fileURLToPath(new URL("../../data", import.meta.url));
export const tutorialDir = (id: string) => `${DATA_DIR}/${id}`;
export const isId = (id: string) => /^[a-z0-9-]{8,40}$/.test(id);

const statuses = new Map<string, TutorialStatus>();

export function getStatus(id: string): TutorialStatus | undefined {
  const known = statuses.get(id);
  if (known) return known;
  // survives a server restart: a finished tutorial is on disk
  const file = `${tutorialDir(id)}/steps.json`;
  if (!existsSync(file)) return undefined;
  const tutorial = TutorialSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  return { state: "ready", tutorial };
}

export const setStatus = (id: string) => (s: TutorialStatus) => statuses.set(id, s);
