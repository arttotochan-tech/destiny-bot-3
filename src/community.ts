import type { NamedActivity, WeeklyReport } from "./types.js";
import { getResetWindow } from "./time.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ANCHOR_RESET = Date.parse("2026-10-13T17:00:00.000Z");

const raidCycle = [
  "Último Deseo", "Jardín de la Salvación", "Cripta de la Piedra Profunda",
  "Cámara de Cristal", "Voto del Discípulo", "La Caída del Rey",
  "Origen de las Pesadillas", "El fin de Crota", "Borde de la Salvación"
];

const dungeonCycle = [
  "El Trono Despedazado", "Foso de la Herejía", "Profecía",
  "Garras de la Avaricia", "Dualidad", "Espira de la Vigía",
  "Espectros de las Profundidades", "Ruina de la Señora de la Guerra",
  "Huésped Vespertino", "Doctrina Fragmentada"
];

export interface CalculatedRotation {
  raids: NamedActivity[];
  dungeons: NamedActivity[];
}

export class CommunityClient {
  async buildWeeklyReport(): Promise<WeeklyReport> {
    const window = getResetWindow();
    const current = rotationForReset(window.startsAt);
    const next = rotationForReset(window.endsAt);
    return {
      ...window,
      ...current,
      nightfalls: [],
      otherHighlights: [
        named(`Próxima semana — Incursiones: ${next.raids.map((item) => item.name).join(" + ")}`),
        named(`Próxima semana — Mazmorras: ${next.dungeons.map((item) => item.name).join(" + ")}`)
      ],
      news: [],
      warnings: ["Rotación calculada desde la secuencia observada; Bungie puede introducir excepciones puntuales."],
      sourceUrl: "https://d2rad.com/"
    };
  }

  async status(): Promise<void> {
    rotationForReset(getResetWindow().startsAt);
  }
}

export function rotationForReset(startsAt: Date): CalculatedRotation {
  const weeks = Math.floor((startsAt.getTime() - ANCHOR_RESET) / WEEK_MS);
  return {
    raids: [raidCycle[positiveModulo(4 + weeks, raidCycle.length)]!, raidCycle[positiveModulo(weeks, raidCycle.length)]!].map(named),
    dungeons: [dungeonCycle[positiveModulo(2 + weeks, dungeonCycle.length)]!, dungeonCycle[positiveModulo(8 + weeks, dungeonCycle.length)]!].map(named)
  };
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function named(name: string): NamedActivity {
  return { hash: 0, name };
}

export function parseList(markdown: string, label: "Raid" | "Dungeon"): string[] {
  const match = new RegExp(`^\\s*[*-]\\s*${label}:\\s*(.+)$`, "im").exec(markdown);
  if (!match?.[1]) return [];
  return cleanMarkdown(match[1]).split(",").map((value) => value.trim()).filter(Boolean);
}

export function parseGrandmaster(markdown: string): string | undefined {
  const match = /^#\s*Vanguard Alert\s*-\s*Grandmaster:\s*(.+)$/im.exec(markdown);
  return match?.[1] ? cleanMarkdown(match[1]).trim() : undefined;
}

function cleanMarkdown(value: string): string {
  return value.replace(/\[([^\]]+)]\([^)]+\)/g, "$1").replace(/[*_`]/g, "").trim();
}
