import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

interface BotState {
  lastAutomaticReset?: string;
}

export class StateStore {
  private readonly file: string;
  constructor(dataDir: string) {
    this.file = path.join(dataDir, "state.json");
  }

  async read(): Promise<BotState> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as BotState;
    } catch {
      return {};
    }
  }

  async markAutomaticPost(resetId: string): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify({ lastAutomaticReset: resetId }, null, 2), "utf8");
  }
}
