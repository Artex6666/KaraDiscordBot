const { ActivityType } = require('discord.js');
const client = require('..');
const chalk = require('chalk');

client.on("clientReady", () => {
	const activities = [
		{ name: `${client.guilds.cache.size} Serveurs`, type: ActivityType.Listening },
		{ name: `${client.users.cache.size} Membres`, type: ActivityType.Watching },
		{ name: `EtileVanguard: ON`, type: ActivityType.Competing }
	];
	const status = [
		'dnd',
		'idle'
	];
	let i = 0;
	setInterval(() => {
		if(i >= activities.length) i = 0
		client.user.setActivity(activities[i])
		i++;
	}, 5000);

	let s = 0;
	setInterval(() => {
		if(s >= activities.length) s = 0
		client.user.setStatus(status[s])
		s++;
	}, 10000);
	console.log(chalk.red(`${client.user.tag} est connecté!`))

	// Update membres count channel at startup
	try {
		const countChannelId = '1432418089382973460';
		const ch = client.channels.cache.get(countChannelId);
		if (ch && ch.setName) {
			const guild = ch.guild;
			const total = guild ? guild.memberCount : 0;
			ch.setName(`Membres: ${total}`).catch(() => {});
		}
	} catch (_) {}
});

// Update on member join/leave
const COUNT_CHANNEL_ID = '1432418089382973460';

function updateMemberCounter(guild) {
    try {
        const ch = guild.client.channels.cache.get(COUNT_CHANNEL_ID);
        if (ch && ch.setName) {
            ch.setName(`Membres: ${guild.memberCount}`).catch(() => {});
        }
    } catch (_) {}
}

client.on('guildMemberAdd', (member) => updateMemberCounter(member.guild));
client.on('guildMemberRemove', (member) => updateMemberCounter(member.guild));