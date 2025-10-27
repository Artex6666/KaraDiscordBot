const { EmbedBuilder, ApplicationCommandType, ApplicationCommandOptionType, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const fs = require("fs")
const parse = "./servConfig.json"

module.exports = {
	name: 'role',
	description: "gestion des roles",
	cooldown: 3000,
	type: ApplicationCommandType.ChatInput,
    default_member_permissions: 'Administrator',
	options: [
        {
            name: 'reaction',
            description: 'permet de mettre en place un role reaction (limité à 4)',
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
                    name: 'role4',
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
                const role4 = interaction.options.get('role4') && interaction.options.get('role4').role ;
                const channel = interaction.options.get('channel') && interaction.options.get('channel').channel || interaction.channel;
                const description = interaction.options.get('description') && interaction.options.get('description').value|| `> *Cliquez sur les boutons ci-dessous qui vous intéresses.*`;
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
                        .setCustomId('niveau1')
                );
                if (niveau2){  
                    roles.push(niveau2.id)
                    buttons.addComponents(
                        new ButtonBuilder()
                            .setLabel(niveau2.name)
                            .setStyle('Success')
                            .setCustomId('niveau2')
                    )
                }
                if (niveau3){  
                    roles.push(niveau3.id)
                    buttons.addComponents(
                        new ButtonBuilder()
                            .setLabel(niveau3.name)
                            .setStyle('Success')
                            .setCustomId('niveau3')
                    )
                }
                if (role4){  
                    roles.push(role4.id)
                    buttons.addComponents(
                        new ButtonBuilder()
                            .setLabel(role4.name)
                            .setStyle('Success')
                            .setCustomId('role4')
                    )
                }
                    
                channel.send({ embeds: [embed], components: [buttons] });

                if (configServerFile.hasOwnProperty(interaction.guild.id)) {
                    configServerFile[interaction.guild.id].rolesReactions = roles
                } else {
                    let data = { 
                        rolesReactions: roles
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