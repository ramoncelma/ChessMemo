import { get, set } from "idb-keyval";
import type { Study } from "./types";

const KEY = "chessmemo.studies";

export async function loadStudies(): Promise<Study[]> {
  return (await get<Study[]>(KEY)) ?? [];
}

export async function saveStudies(studies: Study[]): Promise<void> {
  await set(KEY, studies);
}
