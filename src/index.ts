import http from "node:http";
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  WebhookClient,
  type ChatInputCommandInteraction,
  type TextChannel
} from "discord.js";
import { BungieClient } from "./bungie.js";
import { CommunityClient } from "./community.js";
import { commands } from "./commands.js";
import { loadConfig } from "./config.js";
import { newsEmbed, rotationEmbed, weeklyEmbed } from "./report.js";
import { StateStore } from "./state.js";
import { getResetWindow } from "./time.js";

const config = loadConfig();
const bungie = new BungieClient(config);
const community = new CommunityClient();
const reportProvider = config.DATA_SOURCE === "bungie" ? bungie : community;
const state = new StateStore(config.DATA_DIR);
const client = config.DISCORD_TOKEN ? new Client({ intents: [GatewayIntentBits.Guilds] }) : undefined;
const webhook = config.DISCORD_WEBHOOK_URL ? new WebhookClient({ url: config.DISCORD_WEBHOOK_URL }) : undefined;

function log(level: "debug" | "info" | "warn" | "error", message: string, error?: unknown): void {
  const priorities = { debug: 10, info: 20, warn: 30, error: 40 };
  if (priorities[level] < priorities[config.LOG_LEVEL]) return;
  const suffix = error instanceof Error ? `: ${error.message}` : error ? `: ${String(error)}` : "";
  console[level](`[${new Date().toISOString()}] ${message}${suffix}`);
}

async function registerCommands(): Promise<void> {
  if (!config.DISCORD_TOKEN || !config.DISCORD_CLIENT_ID) return;
  const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);
  if (config.DISCORD_GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID), { body: commands });
    log("info", "Comandos registrados en el servidor de desarrollo.");
  } else {
    await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), { body: commands });
    log("info", "Comandos globales registrados; Discord puede tardar en propagarlos.");
  }
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  try {
    if (interaction.commandName === "estado") {
      if (config.DATA_SOURCE === "bungie") await bungie.publicMilestones();
      else await community.status();
      await interaction.editReply(`✅ Discord y la fuente ${config.DATA_SOURCE} funcionan. Reset actual: ${getResetWindow().resetId}.`);
      return;
    }
    const report = await reportProvider.buildWeeklyReport();
    const embed = interaction.commandName === "noticias"
      ? newsEmbed(report)
      : interaction.commandName === "rotacion"
        ? rotationEmbed(report)
        : weeklyEmbed(report);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    log("error", `Falló /${interaction.commandName}`, error);
    await interaction.editReply("No pude consultar la rotación en este momento. Inténtalo de nuevo en unos minutos.");
  }
}

async function automaticWeeklyPost(): Promise<void> {
  if (!config.AUTO_POST) return;
  const resetId = getResetWindow().resetId;
  const stored = await state.read();
  if (stored.lastAutomaticReset === resetId) return;

  if (webhook) {
    const report = await reportProvider.buildWeeklyReport();
    await webhook.send({ embeds: [weeklyEmbed(report)] });
    await state.markAutomaticPost(resetId);
    log("info", `Resumen automático publicado por webhook para ${resetId}.`);
    return;
  }

  if (!client || !config.DISCORD_CHANNEL_ID) return;
  const channel = await client.channels.fetch(config.DISCORD_CHANNEL_ID);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error("DISCORD_CHANNEL_ID no corresponde a un canal de texto accesible.");
  }
  try {
    const recent = await (channel as TextChannel).messages.fetch({ limit: 50 });
    const marker = `reset:${resetId}`;
    const alreadyPublished = recent.some((message) =>
      message.author.id === client.user?.id &&
      message.embeds.some((embed) => embed.footer?.text.includes(marker))
    );
    if (alreadyPublished) {
      await state.markAutomaticPost(resetId);
      return;
    }
  } catch (error) {
    log("warn", "No se pudo revisar el historial; se usará solamente el estado local", error);
  }
  const report = await reportProvider.buildWeeklyReport();
  await (channel as TextChannel).send({ embeds: [weeklyEmbed(report)] });
  await state.markAutomaticPost(resetId);
  log("info", `Resumen automático publicado para ${resetId}.`);
}

function startScheduler(): void {
  // Se comprueba periódicamente; el estado y el marcador del mensaje evitan duplicados.
  // Así también recuperamos una publicación si Railway estaba reiniciándose a las 17:05 UTC.
  setInterval(() => {
    automaticWeeklyPost().catch((error) => log("error", "Falló la publicación automática", error));
  }, 10 * 60 * 1000).unref();
  automaticWeeklyPost().catch((error) => log("error", "Falló la recuperación de la publicación semanal", error));
}

if (client) {
  client.once(Events.ClientReady, async (readyClient) => {
    log("info", `Conectado como ${readyClient.user.tag}.`);
    try {
      await registerCommands();
    } catch (error) {
      log("error", "No se pudieron registrar los comandos", error);
    }
    startScheduler();
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    handleCommand(interaction).catch((error) => log("error", "Error no controlado procesando un comando", error));
  });
} else {
  log("info", "Modo webhook: los comandos slash están desactivados.");
  startScheduler();
}

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    const ready = webhook ? true : Boolean(client?.isReady());
    response.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: ready, discord: webhook ? "webhook" : ready ? "ready" : "connecting" }));
    return;
  }
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  response.end("Destiny Semanal Bot\n");
});

server.listen(config.PORT, () => log("info", `Healthcheck escuchando en :${config.PORT}.`));
if (client && config.DISCORD_TOKEN) {
  client.login(config.DISCORD_TOKEN).catch((error) => {
    log("error", "No se pudo iniciar sesión en Discord", error);
    process.exitCode = 1;
  });
}

function shutdown(signal: string): void {
  log("info", `Cerrando por ${signal}.`);
  client?.destroy();
  webhook?.destroy();
  server.close(() => process.exit(0));
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
