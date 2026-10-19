import { EmbedBuilder } from "discord.js";
import type { NamedActivity, WeeklyReport } from "./types.js";
import { discordTimestamp } from "./time.js";

function names(items: Array<{ name: string }>, empty: string): string {
  return items.length ? items.map((item) => `• ${item.name}`).join("\n").slice(0, 1024) : empty;
}

function activities(items: NamedActivity[], empty: string): string {
  if (!items.length) return empty;
  return items.map((item) => {
    const modifiers = item.modifiers?.filter(Boolean).slice(0, 5) ?? [];
    const detail = modifiers.length ? `\n  ↳ ${modifiers.join(" · ")}` : "";
    return `• **${item.name}**${detail}`;
  }).join("\n").slice(0, 1024);
}

export function weeklyEmbed(report: WeeklyReport): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xf5c542)
    .setTitle("Destiny 2 — Resumen semanal")
    .setDescription(`Semana de ${discordTimestamp(report.startsAt)} a ${discordTimestamp(report.endsAt)}.`)
    .addFields(
      { name: "⚔️ Incursiones destacadas", value: activities(report.raids, "No disponibles en la fuente actual."), inline: false },
      { name: "🏰 Mazmorras destacadas", value: activities(report.dungeons, "No disponibles en la fuente actual."), inline: false },
      { name: "🌌 Ocaso / Gran Maestro", value: activities(report.nightfalls, "Bungie no lo expuso sin una cuenta de referencia."), inline: false }
    )
    .setFooter({ text: `Resumen semanal • reset:${report.resetId}` })
    .setTimestamp();

  if (report.otherHighlights.length) {
    embed.addFields({ name: "📌 Otros rotadores", value: names(report.otherHighlights, "—"), inline: false });
  }
  if (report.news.length) {
    embed.addFields({
      name: "📰 Noticias oficiales",
      value: report.news.map((item) => `• [${item.title}](${item.link})`).join("\n").slice(0, 1024),
      inline: false
    });
  }
  if (report.warnings.length) {
    embed.addFields({ name: "ℹ️ Cobertura", value: report.warnings.join("\n").slice(0, 1024), inline: false });
  }
  if (report.sourceUrl) embed.setURL(report.sourceUrl);
  return embed;
}

export function rotationEmbed(report: WeeklyReport): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Rotación semanal de Destiny 2")
    .addFields(
      { name: "Incursiones", value: activities(report.raids, "No detectadas"), inline: false },
      { name: "Mazmorras", value: activities(report.dungeons, "No detectadas"), inline: false }
    )
    .setDescription(`Siguiente reinicio ${discordTimestamp(report.endsAt, "R")}.`)
    .setFooter({ text: `Rotación semanal • reset:${report.resetId}` });
  if (report.sourceUrl) embed.setURL(report.sourceUrl);
  return embed;
}

export function newsEmbed(report: WeeklyReport): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle("Noticias oficiales de Destiny 2")
    .setDescription(
      report.news.length
        ? report.news.map((item) => `### [${item.title}](${item.link})\n${item.description?.slice(0, 220) ?? ""}`).join("\n\n").slice(0, 4000)
        : "Bungie no devolvió noticias en este momento."
    )
    .setTimestamp();
}
