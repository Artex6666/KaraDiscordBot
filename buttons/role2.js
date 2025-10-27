const fs = require("fs")
const parse = "./servConfig.json"

module.exports = {
	id: 'role2',
	permissions: [],
	run: async (client, interaction) => {
		var configServerFile = JSON.parse(fs.readFileSync(parse, "utf-8"));
		var role = configServerFile[interaction.guild.id].rolesReactions[1] 

        if (!interaction.member.roles.cache.get(role)){
			interaction.member.roles.add(role);
			return interaction.reply({ content: `✅| ${interaction.user.username} , Tu es désormais <@&${role}>!`, ephemeral: true })

		}
		interaction.member.roles.remove(role);
		return interaction.reply({ content: `❌| ${interaction.user.username} , Tu n'es désormais plus <@&${role}>.`, ephemeral: true })
	}
};
