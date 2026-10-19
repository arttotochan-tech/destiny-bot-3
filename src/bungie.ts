import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Config } from "./config.js";
import { CommunityClient } from "./community.js";
import type { NamedActivity, NewsItem, WeeklyReport } from "./types.js";
import { getResetWindow } from "./time.js";
import { normalizeText, stripHtml, uniqueByName } from "./text.js";

type Json = Record<string, unknown>;

interface Definition {
  hash?: number;
  displayProperties?: { name?: string; description?: string; icon?: string };
  activityTypeHash?: number;
  directActivityModeType?: number;
  activityModeTypes?: number[];
}

const API_ROOT = "https://www.bungie.net/Platform";
const SITE_ROOT = "https://www.bungie.net";
const RAID_MODE = 4;
const DUNGEON_MODE = 82;

export class BungieClient {
  private memoryCache = new Map<string, Definition>();
  private resolvedMembership?: Promise<{ membershipType: number; membershipId: string } | undefined>;

  constructor(private readonly config: Config) {}

  private async request<T>(route: string, init: RequestInit = {}): Promise<T> {
    if (!this.config.BUNGIE_API_KEY) throw new Error("Falta BUNGIE_API_KEY");
    const response = await fetch(`${API_ROOT}${route}`, {
      ...init,
      headers: {
        "X-API-Key": this.config.BUNGIE_API_KEY,
        "content-type": "application/json",
        ...init.headers
      }
    });
    if (!response.ok) throw new Error(`Bungie respondió ${response.status} en ${route}`);
    const body = (await response.json()) as { Response?: T; ErrorCode?: number; Message?: string };
    if (body.ErrorCode && body.ErrorCode !== 1) {
      throw new Error(`Bungie API: ${body.Message ?? `Error ${body.ErrorCode}`}`);
    }
    if (body.Response === undefined) throw new Error("Respuesta vacía de Bungie");
    return body.Response;
  }

  private cachePath(entityType: string, hash: number): string {
    return path.join(this.config.DATA_DIR, "definitions", this.config.BUNGIE_LOCALE, entityType, `${hash}.json`);
  }

  async definition(entityType: string, hash: number): Promise<Definition> {
    const key = `${entityType}:${hash}`;
    const memory = this.memoryCache.get(key);
    if (memory) return memory;

    const file = this.cachePath(entityType, hash);
    try {
      const cached = JSON.parse(await readFile(file, "utf8")) as Definition;
      this.memoryCache.set(key, cached);
      return cached;
    } catch {
      // La primera consulta se resuelve contra Bungie y luego queda en caché.
    }

    const definition = await this.request<Definition>(
      `/Destiny2/Manifest/${entityType}/${hash}/?lc=${encodeURIComponent(this.config.BUNGIE_LOCALE)}`
    );
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(definition), "utf8");
    this.memoryCache.set(key, definition);
    return definition;
  }

  async publicMilestones(): Promise<Json> {
    return this.request<Json>("/Destiny2/Milestones/");
  }

  async characterActivities(): Promise<Json[]> {
    const membership = await this.referenceMembership();
    if (!membership) return [];
    const { membershipId, membershipType } = membership;
    const profile = await this.request<Json>(
      `/Destiny2/${membershipType}/Profile/${membershipId}/?components=200,204`
    );
    const data = (((profile.characterActivities as Json | undefined)?.data ?? {}) as Json);
    return Object.values(data).flatMap((character) => {
      const activities = (character as Json)?.availableActivities;
      return Array.isArray(activities) ? (activities as Json[]) : [];
    });
  }

  private referenceMembership(): Promise<{ membershipType: number; membershipId: string } | undefined> {
    if (!this.resolvedMembership) this.resolvedMembership = this.resolveReferenceMembership();
    return this.resolvedMembership;
  }

  private async resolveReferenceMembership(): Promise<{ membershipType: number; membershipId: string } | undefined> {
    const { BUNGIE_MEMBERSHIP_ID: membershipId, BUNGIE_MEMBERSHIP_TYPE: membershipType } = this.config;
    if (membershipId && membershipType !== undefined) return { membershipId, membershipType };

    const bungieName = this.config.BUNGIE_NAME?.trim();
    if (!bungieName) return undefined;
    const match = /^(.*)#(\d{4})$/.exec(bungieName);
    if (!match) throw new Error("BUNGIE_NAME debe tener el formato Nombre#1234");
    const profiles = await this.request<Json[]>("/Destiny2/SearchDestinyPlayerByBungieName/-1/", {
      method: "POST",
      body: JSON.stringify({ displayName: match[1]!, displayNameCode: Number(match[2]!) })
    });
    const profile = profiles.find((item) => Number(item.crossSaveOverride) === Number(item.membershipType)) ?? profiles[0];
    if (!profile) throw new Error(`No se encontró la cuenta ${bungieName}`);
    return { membershipType: Number(profile.membershipType), membershipId: String(profile.membershipId) };
  }

  async news(limit = 3): Promise<NewsItem[]> {
    const response = await this.request<Json>("/Content/Rss/NewsArticles/0/?categoryfilter=destiny&includebody=false");
    const raw = (response.NewsArticles ?? response.newsArticles ?? []) as Json[];
    return raw.slice(0, limit).map((item) => {
      const link = String(item.Link ?? item.link ?? "");
      return {
        title: String(item.Title ?? item.title ?? "Noticias de Bungie"),
        link: this.localizeNewsUrl(link),
        publishedAt: String(item.PubDate ?? item.pubDate ?? "") || undefined,
        description: stripHtml(String(item.Description ?? item.description ?? "")) || undefined
      };
    });
  }

  private localizeNewsUrl(url: string): string {
    const absolute = url.startsWith("/") ? `${SITE_ROOT}${url}` : url;
    return absolute.replace("/7/en/", `/7/${this.config.BUNGIE_LOCALE}/`);
  }

  async buildWeeklyReport(): Promise<WeeklyReport> {
    const window = getResetWindow();
    const fallback = await new CommunityClient().buildWeeklyReport();
    const warnings: string[] = [];
    const [milestonesResult, activitiesResult, newsResult] = await Promise.allSettled([
      this.publicMilestones(),
      this.characterActivities(),
      this.news()
    ]);

    const milestones = milestonesResult.status === "fulfilled" ? milestonesResult.value : {};
    const activities = activitiesResult.status === "fulfilled" ? activitiesResult.value : [];
    const news = newsResult.status === "fulfilled" ? newsResult.value : [];

    if (milestonesResult.status === "rejected") warnings.push("Bungie no respondió; se usó el calendario local de respaldo.");
    if (newsResult.status === "rejected") warnings.push("Las noticias oficiales no estuvieron disponibles en esta consulta.");
    if ((this.config.BUNGIE_MEMBERSHIP_ID || this.config.BUNGIE_NAME) && activitiesResult.status === "rejected") {
      warnings.push("La cuenta de referencia no permitió consultar sus actividades.");
    }

    const liveActivities = [...activities, ...extractObjectsWithActivityHash(milestones)];
    const featured = await this.findFeaturedEndgame(liveActivities);
    const milestoneHighlights = await this.findMilestoneHighlights(milestones);
    const officialFallbackRaids = await this.enrichScheduledRaids(fallback.raids, milestones);

    // Los milestones no siempre marcan de manera inequívoca los dos rotadores.
    // Solo sustituimos el calendario cuando la API encontró al menos dos opciones.
    const raids = featured.raids.length >= 2 ? featured.raids : officialFallbackRaids;
    const dungeons = featured.dungeons.length >= 2 ? featured.dungeons : fallback.dungeons;
    if (featured.raids.length < 2 || featured.dungeons.length < 2) {
      warnings.push("Rotadores completados con el calendario local; nombres, desafíos y noticias provienen de Bungie.");
    }

    return {
      ...window,
      raids,
      dungeons,
      nightfalls: milestoneHighlights.nightfalls,
      otherHighlights: uniqueByName([...milestoneHighlights.other, ...fallback.otherHighlights]),
      news,
      warnings,
      sourceUrl: "https://www.bungie.net/7/es-mx/News"
    };
  }

  private async enrichScheduledRaids(scheduled: NamedActivity[], milestones: Json): Promise<NamedActivity[]> {
    const milestoneDefinitions = (await mapLimit(Object.entries(milestones), 8, async ([hashText, runtime]) => {
      try {
        const definition = await this.definition("DestinyMilestoneDefinition", Number(hashText));
        return { definition, runtime: runtime as Json };
      } catch {
        return undefined;
      }
    })).filter((item): item is NonNullable<typeof item> => Boolean(item));

    return mapLimit(scheduled, 2, async (raid) => {
      const wanted = normalizeText(raid.name);
      const milestone = milestoneDefinitions.find(({ definition }) =>
        normalizeText(definition.displayProperties?.name ?? "") === wanted
      );
      if (!milestone) return raid;

      const activity = extractObjectsWithActivityHash(milestone.runtime)[0];
      if (!activity) return raid;
      const activityHash = Number(activity.activityHash);
      const activeModifierHashes = numberArray(activity.modifierHashes);
      const modifierDefinitions = (await mapLimit(activeModifierHashes, 6, async (hash) => {
        try {
          return { hash, definition: await this.definition("DestinyActivityModifierDefinition", hash) };
        } catch {
          return undefined;
        }
      })).filter((item): item is { hash: number; definition: Definition } => Boolean(item));

      try {
        const activityDefinition = await this.definition("DestinyActivityDefinition", activityHash);
        return toNamedActivity(activityHash, activityDefinition, modifierDefinitions, activeModifierHashes);
      } catch {
        return {
          ...raid,
          name: milestone.definition.displayProperties?.name?.trim() || raid.name,
          description: milestone.definition.displayProperties?.description?.trim() || undefined,
          icon: milestone.definition.displayProperties?.icon
        };
      }
    });
  }

  private async findFeaturedEndgame(activities: Json[]): Promise<{ raids: NamedActivity[]; dungeons: NamedActivity[] }> {
    const modifierHashes = uniqueNumbers(activities.flatMap((activity) => numberArray(activity.modifierHashes)));
    const modifierDefinitions = (await mapLimit(modifierHashes, 8, async (hash) => {
      try {
        return { hash, definition: await this.definition("DestinyActivityModifierDefinition", hash) };
      } catch {
        return undefined;
      }
    })).filter((item): item is { hash: number; definition: Definition } => Boolean(item));
    const weeklyHashes = new Set(
      modifierDefinitions
        .filter(({ definition }) => {
          const text = normalizeText(`${definition.displayProperties?.name ?? ""} ${definition.displayProperties?.description ?? ""}`);
          return /(weekly|semanal)/.test(text) && /(raid|incursion|dungeon|mazmorra)/.test(text);
        })
        .map(({ hash }) => hash)
    );

    const candidates = activities.filter((activity) =>
      numberArray(activity.modifierHashes).some((hash) => weeklyHashes.has(hash))
    );
    const resolved = (await mapLimit(candidates, 8, async (activity) => {
      try {
        const hash = Number(activity.activityHash);
        const definition = await this.definition("DestinyActivityDefinition", hash);
        return {
          activity,
          definition,
          named: toNamedActivity(hash, definition, modifierDefinitions, numberArray(activity.modifierHashes))
        };
      } catch {
        return undefined;
      }
    })).filter((item): item is NonNullable<typeof item> => Boolean(item));

    const raids: NamedActivity[] = [];
    const dungeons: NamedActivity[] = [];
    for (const item of resolved) {
      const modes = new Set([item.definition.directActivityModeType, ...(item.definition.activityModeTypes ?? [])]);
      if (modes.has(RAID_MODE)) raids.push(item.named);
      if (modes.has(DUNGEON_MODE)) dungeons.push(item.named);
    }
    return { raids: uniqueByName(raids), dungeons: uniqueByName(dungeons) };
  }

  private async findMilestoneHighlights(milestones: Json): Promise<{ nightfalls: NamedActivity[]; other: NamedActivity[] }> {
    const entries = Object.entries(milestones).slice(0, 100);
    const results = await mapLimit(entries, 8, async ([hashText, runtime]) => {
      const hash = Number(hashText);
      if (!Number.isFinite(hash)) return undefined;
      try {
        const definition = await this.definition("DestinyMilestoneDefinition", hash);
        const props = definition.displayProperties ?? {};
        return {
          hash,
          name: props.name?.trim() || `Hito ${hash}`,
          description: props.description?.trim() || undefined,
          icon: props.icon,
          runtime: runtime as Json
        };
      } catch {
        return undefined;
      }
    });

    const useful = results.filter((item): item is NonNullable<typeof item> => Boolean(item)).filter((item) => {
      const text = normalizeText(`${item.name} ${item.description ?? ""}`);
      return /(nightfall|ocaso|gran maestro|crisol|crucible|pruebas|trials|estandarte|iron banner|panteon|pantheon|vanguardia|vanguard)/.test(text);
    });
    const nightfallMilestones = useful.filter((item) => /(nightfall|ocaso|gran maestro)/.test(normalizeText(`${item.name} ${item.description ?? ""}`)));
    const other = useful.filter((item) => !nightfallMilestones.includes(item)).slice(0, 6);
    const nightfallActivities = (await mapLimit(
      uniqueNumbers(nightfallMilestones.flatMap((item) => extractObjectsWithActivityHash(item.runtime).map((activity) => Number(activity.activityHash)))),
      8,
      async (hash) => {
        try {
          const definition = await this.definition("DestinyActivityDefinition", hash);
          return toNamedActivity(hash, definition, []);
        } catch {
          return undefined;
        }
      }
    )).filter((item): item is NamedActivity => Boolean(item));
    const nightfalls = nightfallActivities.length
      ? nightfallActivities
      : nightfallMilestones.map(({ runtime: _runtime, ...item }) => item);
    return {
      nightfalls: uniqueByName(nightfalls),
      other: uniqueByName(other.map(({ runtime: _runtime, ...item }) => item))
    };
  }
}

function toNamedActivity(
  hash: number,
  definition: Definition,
  modifierDefinitions: Array<{ hash: number; definition: Definition }>,
  activeModifierHashes: number[] = []
): NamedActivity {
  const rawName = definition.displayProperties?.name?.trim() || `Actividad ${hash}`;
  return {
    hash,
    name: rawName.replace(/:\s*(estándar|standard)$/i, ""),
    description: definition.displayProperties?.description?.trim() || undefined,
    icon: definition.displayProperties?.icon,
    modifiers: modifierDefinitions
      .filter(({ hash: modifierHash }) => activeModifierHashes.includes(modifierHash))
      .map(({ definition: modifier }) => modifier.displayProperties?.name?.trim())
      .filter((name): name is string => Boolean(name))
  };
}

export function extractObjectsWithActivityHash(value: unknown): Json[] {
  const found: Json[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const object = node as Json;
    if (typeof object.activityHash === "number") found.push(object);
    Object.values(object).forEach(visit);
  };
  visit(value);
  return found;
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

async function mapLimit<T, U>(items: T[], limit: number, mapper: (item: T) => Promise<U>): Promise<U[]> {
  const output = new Array<U>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index] as T);
    }
  }));
  return output;
}
