const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ApplicationCommandType, ButtonStyle } = require('discord.js');

module.exports = {
	name: 'invite',
	description: "Obtenir le lien d'invitation du bot",
	type: ApplicationCommandType.ChatInput,
	run: async (client, interaction) => {
		const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;
		const embed = new EmbedBuilder()
		.setTitle('Invite moi !')
		.setDescription(`Invite moi sur ton serveur si tu souhaites obtenir une protection antiraid digne de Rinoshield. [ICI](${inviteUrl})`)
		.setColor('#03fcdb')
		.setTimestamp()
		.setThumbnail(client.user.displayAvatarURL())
		.setFooter({ text: client.user.tag })

		const actionRow = new ActionRowBuilder()
		.addComponents([
			new ButtonBuilder()
			.setLabel('Invitation')
			.setURL(inviteUrl)
			.setStyle(ButtonStyle.Link)
		])
		return interaction.reply({ embeds: [embed], components: [actionRow] })
	}
};
