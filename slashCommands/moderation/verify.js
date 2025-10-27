const { EmbedBuilder, ApplicationCommandType, ApplicationCommandOptionType, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const fs = require("fs")
const parse = "./servConfig.json"

module.exports = {
	name: 'portail',
	description: "créer un portail d'accès",
	cooldown: 3000,
	type: ApplicationCommandType.ChatInput,
    default_member_permissions: 'Administrator',
	options: [
        {
            name: 'set',
            description: 'ajoute le role défini suite à la vérification',
            type: 1,
            options: [
                {
                    name: 'role',
                    description: '[Role à donner]',
                    type: ApplicationCommandOptionType.Role,
                    required: true
                },
                {
                    name: 'channel',
                    description: '[Salon textuel spécifié]',
                    type: ApplicationCommandOptionType.Channel,
                    required: false
                },
                {
                    name: 'embed_title',
                    description: 'Titre de l\'embed',
                    type: ApplicationCommandOptionType.String,
                    required: false
                },
                {
                    name: 'embed_description',
                    description: 'Description de l\'embed',
                    type: ApplicationCommandOptionType.String,
                    required: false
                }
            ]
        }
    ],
	run: async (client, interaction) => {
        const configServerFile = JSON.parse(fs.readFileSync(parse, "utf-8"));

        if(interaction.options._subcommand === 'set') {
            try {
                const role = interaction.options.get('role').role;
                const title = interaction.options.get('embed_title') && interaction.options.get('embed_title').value || '**Verification:**';
                const description = interaction.options.get('embed_description') && interaction.options.get('embed_description').value|| `> *Clique sur le bouton ci-dessous pour passer la vérification.*`;
                const channel = interaction.options.get('channel').channel || interaction.channel;
    
                const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor('White')
                .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

                const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                    .setLabel('Accepter')
                    .setStyle('Success')
                    .setCustomId('verify_button')
                );
                await channel.send({ embeds: [embed], components: [buttons] });

                if (configServerFile.hasOwnProperty(interaction.guild.id)) {
                    configServerFile[interaction.guild.id].verifyRole = role.id
                } else {
                    let data = { 
                        verifyRole: role.id
                    }
                    configServerFile[interaction.guild.id] = data
                }
                fs.writeFileSync("servConfig.json", JSON.stringify(configServerFile, null, 2))

                return interaction.reply({ content: `> Mise en place de la verification  effectuée✔️.`, ephemeral: true });
                } 
                catch (error){
                console.error(error)
                return interaction.reply({ content: `> Désolé, une erreur est survenue... ❌`, ephemeral: true });
            }
        }
	}
};