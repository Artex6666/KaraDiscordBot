const { ActivityType } = require('discord.js');
const client = require('..');
const chalk = require('chalk');

client.on("ready", () => {
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
});