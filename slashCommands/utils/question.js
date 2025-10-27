//
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI,
});
const openai = new OpenAIApi(configuration);

const { EmbedBuilder, ApplicationCommandType, ApplicationCommandOptionType, ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
	name: "question",
	description: "permet de poser une question au bot",
	type: ApplicationCommandType.ChatInput,
	options: [
		{
			name: "demande",
      description: "Votre question",
			type: 3,
			required: true,
		}
	],
    run: async (client, interaction) => {
        const question = interaction.options.get('demande').value
        const responseData = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: question,
			      max_tokens: 1000,
            temperature: 0.4,
          })
		let response =  responseData.data.choices[0].text.slice(1).trim();
		
		const embed = new EmbedBuilder()
		.setDescription(`**Question:** ${question} \n\n> *${response}*`)
		.setColor("White")
		.setTimestamp()
		.setFooter({ text: client.user.username, iconURL: client.user.displayAvatarURL() });

		return interaction.reply({ embeds: [embed]})
	}
};