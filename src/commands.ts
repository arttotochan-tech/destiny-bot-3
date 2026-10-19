import { SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder().setName("semana").setDescription("Muestra el resumen semanal de Destiny 2."),
  new SlashCommandBuilder().setName("rotacion").setDescription("Muestra las incursiones y mazmorras destacadas."),
  new SlashCommandBuilder().setName("noticias").setDescription("Muestra las últimas noticias oficiales de Bungie."),
  new SlashCommandBuilder().setName("estado").setDescription("Comprueba la conexión del bot y la API de Bungie.")
].map((command) => command.toJSON());
