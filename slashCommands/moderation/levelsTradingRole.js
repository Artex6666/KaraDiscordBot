const { EmbedBuilder, ApplicationCommandType, ApplicationCommandOptionType, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const fs = require("fs")
const parse = "./servConfig.json"

module.exports = {
	name: 'roletradinglevel',
	description: "gestion des roles de niveau de trading",
	cooldown: 3000,
	type: ApplicationCommandType.ChatInput,
    default_member_permissions: 'Administrator',
	options: [
        {
            name: 'reaction',
            description: 'permet de mettre en place un role reaction de niveaux (limité à 4)',
            type: 1,
            options: [
                {
                    name: 'niveau1',
                    description: '[Role à donner]',
                    type: ApplicationCommandOptionType.Role,
                    required: true
                },
                {
                    name: 'channel',
                    description: '(Salon textuel spécifié)',
                    type: ApplicationCommandOptionType.Channel,
                    required: false
                },
                {
                    name: 'description',
                    description: '(Description du RoleReaction)',
                    type: ApplicationCommandOptionType.String,
                    required: false
                },
                {
                    name: 'niveau2',
                    description: '(Role à donner)',
                    type: ApplicationCommandOptionType.Role,
                    required: false
                },
                {
                    name: 'niveau3',
                    description: '(Role à donner)',
                    type: ApplicationCommandOptionType.Role,
                    required: false
                },
                {
                    name: 'niveau4',
                    description: '(Role à donner)',
                    type: ApplicationCommandOptionType.Role,
                    required: false
                },
            ]
        }
    ],
	run: async (client, interaction) => {
        const configServerFile = JSON.parse(fs.readFileSync(parse, "utf-8"));

        if(interaction.options._subcommand === 'reaction') {
            try {
                const niveau1 = interaction.options.get('niveau1').role ;
                const niveau2 = interaction.options.get('niveau2') && interaction.options.get('niveau2').role ;
                const niveau3 = interaction.options.get('niveau3') && interaction.options.get('niveau3').role ;
                const niveau4 = interaction.options.get('niveau4') && interaction.options.get('niveau4').role ;
                const channel = interaction.options.get('channel') && interaction.options.get('channel').channel || interaction.channel;
                const description = interaction.options.get('description') && interaction.options.get('description').value || "Veuillez choisir le niveau en connaissance de trading qui **vous correspond le mieux**. \n> Il s'agit d'être le plus honnete avec soi-meme, **il ne s'agit pas d'un concours**, mais simplement de permettre aux éducateurs de mentionner les personnes les plus appropriées dans certains cadres."
                var roles = [niveau1.id]

    
                const embed = new EmbedBuilder()
                .setTitle('**Roles Reaction:**')
                .setDescription(description)//`> __Veuillez choisir les roles qui vous conviennent:__\n\n${niveau1}: *Si vous souhaitez être notifié lorsque Omni envoie un ordre.*\n\n${niveau2}: *Si vous souhaitez être notifié en cas d'analyse crypto.*\n\n${niveau3}: *Si vous souhaitez être notifié en cas d'analyse.*`)
                .setColor('Gold')
                .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

                const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel(niveau1.name)
                        .setStyle('Success')
                        .setCustomId('level1')
                );
                if (niveau2){  
                    roles.push(niveau2.id)
                    buttons.addComponents(
                        new ButtonBuilder()
                            .setLabel(niveau2.name)
                            .setStyle('Success')
                            .setCustomId('level2')
                    )
                }
                if (niveau3){  
                    roles.push(niveau3.id)
                    buttons.addComponents(
                        new ButtonBuilder()
                            .setLabel(niveau3.name)
                            .setStyle('Success')
                            .setCustomId('level3')
                    )
                }
                if (niveau4){  
                    roles.push(niveau4.id)
                    buttons.addComponents(
                        new ButtonBuilder()
                            .setLabel(niveau4.name)
                            .setStyle('Success')
                            .setCustomId('level4')
                    )
                }
                    
                channel.send({ embeds: [embed], components: [buttons] });

                if (configServerFile.hasOwnProperty(interaction.guild.id)) {
                    configServerFile[interaction.guild.id].rolesLevelsReactions = roles
                } else {
                    let data = { 
                        rolesLevelsReactions: roles
                    }
                    configServerFile[interaction.guild.id] = data
                }
                fs.writeFileSync("servConfig.json", JSON.stringify(configServerFile, null, 2))

                return interaction.reply({ content: `> Mise en place du RoleReaction effectuée ✔️.`, ephemeral: true });
            } 
            catch (error){
                console.error(error)
                return interaction.reply({ content: `> Désolé, une erreur est survenue... ❌`, ephemeral: true });
            }
        }
	}
};