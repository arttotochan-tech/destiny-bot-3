import "dotenv/config";
import { z } from "zod";

const booleanFromString = z
  .string()
  .default("true")
  .transform((value) => value.toLowerCase() === "true");

const optionalString = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().optional()
);
const optionalUrl = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().url().optional()
);
const optionalNumber = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.coerce.number().int().optional()
);

const schema = z.object({
  DISCORD_TOKEN: optionalString,
  DISCORD_CLIENT_ID: optionalString,
  DISCORD_GUILD_ID: optionalString,
  DISCORD_CHANNEL_ID: optionalString,
  DISCORD_WEBHOOK_URL: optionalUrl,
  DATA_SOURCE: z.enum(["community", "bungie"]).default("bungie"),
  BUNGIE_API_KEY: optionalString,
  BUNGIE_LOCALE: z.string().default("es-mx"),
  BUNGIE_MEMBERSHIP_TYPE: optionalNumber,
  BUNGIE_MEMBERSHIP_ID: optionalString,
  BUNGIE_NAME: optionalString,
  AUTO_POST: booleanFromString,
  DATA_DIR: z.string().default(".data"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
}).superRefine((value, context) => {
  const hasBot = Boolean(value.DISCORD_TOKEN && value.DISCORD_CLIENT_ID);
  const hasWebhook = Boolean(value.DISCORD_WEBHOOK_URL);
  if (!hasBot && !hasWebhook) {
    context.addIssue({
      code: "custom",
      message: "Configura DISCORD_TOKEN + DISCORD_CLIENT_ID o DISCORD_WEBHOOK_URL",
      path: ["DISCORD_TOKEN"]
    });
  }
  if (value.DATA_SOURCE === "bungie" && !value.BUNGIE_API_KEY) {
    context.addIssue({ code: "custom", message: "BUNGIE_API_KEY es obligatoria con DATA_SOURCE=bungie", path: ["BUNGIE_API_KEY"] });
  }
});

export type Config = z.infer<typeof schema>;

// Instalación personal mediante webhook. Una variable de Railway, si existe,
// conserva prioridad y permite reemplazarlo sin modificar el código.
const embeddedWebhookUrl = "https://discord.com/api/webhooks/1561629031814930442/wNYX1ZsacidSCXKsjVrH0PZdgJcGlOOV8NX3y5FSojiBstSwtCaAbP0iWehquVuwJ_x7";

export function loadConfig(): Config {
  const result = schema.safeParse({
    ...process.env,
    // Si existe una API key, la integración oficial se activa automáticamente.
    // BungieClient conserva un calendario local como respaldo.
    DATA_SOURCE: process.env.BUNGIE_API_KEY ? "bungie" : (process.env.DATA_SOURCE ?? "community"),
    DISCORD_TOKEN: undefined,
    DISCORD_CLIENT_ID: undefined,
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL || embeddedWebhookUrl,
    AUTO_POST: "true"
  });
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Faltan variables de entorno o son inválidas: ${fields}`);
  }
  return result.data;
}
