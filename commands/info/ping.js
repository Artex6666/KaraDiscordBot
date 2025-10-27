module.exports = {
	name: 'ping',
	description: "renvoie le ping du bot ",
	cooldown: 3000,
	run: async (client, message, args) => {
		const msg = await message.reply('Mesure en cours...')
		await msg.edit(`Pong! **${client.ws.ping} ms**`)
	}
};