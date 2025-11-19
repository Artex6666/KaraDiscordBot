const { ApplicationCommandType } = require('discord.js');

module.exports = {
	name: 'ping',
	description: "Vérifie la latence du bot",
	type: ApplicationCommandType.ChatInput,
	cooldown: 3000,
	run: async (client, interaction) => {
		try {
			await interaction.deferReply();
			await interaction.editReply({ content: `🏓 Pong! Latence: **${Math.round(client.ws.ping)} ms**` });
		} catch (e) {
			// fallback direct reply if not yet acknowledged
			try { await interaction.reply({ content: `🏓 Pong! Latence: **${Math.round(client.ws.ping)} ms**` }); } catch (_) {}
		}
	}
};