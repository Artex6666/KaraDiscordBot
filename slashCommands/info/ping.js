const { ApplicationCommandType } = require('discord.js');

module.exports = {
	name: 'ping',
	description: "Vérifie la latence du bot",
	type: ApplicationCommandType.ChatInput,
	cooldown: 3000,
	run: async (client, interaction) => {
		interaction.reply({ content: `🏓 Pong! Latence: **${Math.round(client.ws.ping)} ms**` })
	}
};