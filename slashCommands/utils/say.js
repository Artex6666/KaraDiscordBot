const { EmbedBuilder, ApplicationCommandType, ApplicationCommandOptionType, ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
	name: "say",
	description: "permet de faire passer un message via le bot sous forme d'embed",
	type: ApplicationCommandType.ChatInput,
	default_member_permissions: 'ManageMessages',
	options: [
		{
			name: "texte",
			description: "Contenu du message.",
			type: 3,
			required: true,
		},
        {
            name: 'titre',
            description: "donne un titre à l'embed",
            type: ApplicationCommandOptionType.String,
            required: false
        },
		{
            name: 'couleur',
            description: "donne une couleur définie à l'embed [défaut = aléatoire]",
            type: ApplicationCommandOptionType.String,
            required: false
        },
	],
    run: async (client, interaction) => {
		const title = interaction.options.get('titre') && interaction.options.get('titre').value;
		const description = interaction.options.get('texte').value
		const color = interaction.options.get("couleur") && interaction.options.get('couleur').value.toLowerCase().replace(/^\w/, c => c.toUpperCase()) || "Random"
		const embed = new EmbedBuilder()
		.setDescription(description)
		.setColor(color)
		.setTimestamp()
		.setFooter({ text: interaction.user.username, iconURL: interaction.user.displayAvatarURL() });

		if(title) embed.setTitle(title)
		return interaction.channel.send({ embeds: [embed]})
		/*
		catch(error){
			const embed = new EmbedBuilder()
			.setColor("Red")
			.setTimestamp()
			.setFooter({ text: interaction.user.username, iconURL: interaction.user.displayAvatarURL() });
			return interaction.reply({ embeds: [embed.setTitle("ERREUR").setDescription(error)]})
		}*/

	},
};
