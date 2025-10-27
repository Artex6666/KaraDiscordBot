const fs = require("fs")
const parse = "./servConfig.json"

module.exports = {
	id: 'verify_button',
	permissions: [],
	run: async (client, interaction) => {
		var configServerFile = JSON.parse(fs.readFileSync(parse, "utf-8"));
		var verifyRole = configServerFile[interaction.guild.id].verifyRole

		await interaction.member.roles.add(verifyRole);
        if (interaction.member.roles.cache.get(verifyRole)) return interaction.reply({ content: `${interaction.user.username} , Tu es déjà vérifié :)`, ephemeral: true })
        return interaction.reply({ content: `✅| ${interaction.user.username} , Tu es désormais membre, Bienvenue! `, ephemeral: true })
	}
};
