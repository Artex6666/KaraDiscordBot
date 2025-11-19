const { ActivityType } = require('discord.js');
const client = require('..');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

const servConfigPath = path.resolve('/home/omni/KaraBot/servConfig.json');
const callDataPath = path.resolve('/home/omni/KaraBot/callData.json');

function readJsonSafe(filePath) {
	try {
		if (!fs.existsSync(filePath)) return {};
		const raw = fs.readFileSync(filePath, 'utf-8');
		if (!raw.trim()) return {};
		return JSON.parse(raw);
	} catch (_) {
		return {};
	}
}
function writeJsonSafe(filePath, data) {
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

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

	// Recover open trades: ensure reactions and process already-present reactions
	(async () => {
		try {
			const servCfg = readJsonSafe(servConfigPath);
			const data = readJsonSafe(callDataPath);
			const emojis = ['✅','🛑','🟰','❌'];

			for (const [guildId, guildData] of Object.entries(data || {})) {
				const users = guildData.users || {};
				const guild = client.guilds.cache.get(guildId);
				if (!guild) continue;
				for (const [userId, udata] of Object.entries(users)) {
					const trades = udata.trades || [];
					const threadId = servCfg?.[guildId]?.userThreads?.[userId];
					if (!threadId) continue;
					const thread = guild.channels.cache.get(threadId) || await guild.channels.fetch(threadId).catch(() => null);
					if (!thread) continue;
					for (const t of trades) {
						if (t.status !== 'OPEN' || !t.messageId) continue;
						const msg = await thread.messages.fetch(t.messageId).catch(() => null);
						if (!msg) continue;
						// Inspect existing reactions for author/admin to auto-close (ignore bot reactions)
						let decided = null;
						for (const e of ['✅','🛑','🟰','❌']) {
							const reaction = msg.reactions.cache.get(e);
							if (!reaction) continue;
							const usersReacted = await reaction.users.fetch().catch(() => null);
							if (!usersReacted) continue;
							// exclude bot from consideration
							usersReacted.delete(client.user.id);
							const hasOwner = usersReacted.has(userId);
							let hasAdmin = false;
							for (const uid of usersReacted.keys()) {
								if (uid === client.user.id) continue;
								const member = await guild.members.fetch(uid).catch(() => null);
								if (member?.permissions?.has(require('discord.js').PermissionsBitField.Flags.Administrator)) { hasAdmin = true; break; }
							}
							if (hasOwner || hasAdmin) { decided = e; break; }
						}
						if (!decided) continue;
						if (decided === '✅') t.status = 'TP';
						if (decided === '🛑') t.status = 'SL';
						if (decided === '🟰') t.status = 'BE';
						if (decided === '❌') t.status = 'CANCEL';
						t.closedAt = Date.now();
						writeJsonSafe(callDataPath, data);

						// Recompute stats (exclude CANCEL), normalize legacy risks, include adjustments for rename only
						const closed = (trades || []).filter(x => x.status === 'TP' || x.status === 'SL' || x.status === 'BE');
						let wins = 0; let rrSum = 0;
						for (const c of closed) {
							if (c.status === 'TP') wins += 1;
							const signed = c.status === 'TP' ? c.rr : (c.status === 'SL' ? -1 : 0);
							const riskNorm = (Number(c.risk) || 0) > 1 ? (Number(c.risk) / 100) : (Number(c.risk) || 0);
							const weight = riskNorm / 0.01;
							rrSum += weight * signed;
						}
						const total = closed.length;
						const winrate = total ? Math.round((wins / total) * 100) : 0;
						const minutes = t.createdAt ? Math.floor((t.closedAt - t.createdAt) / 60000) : 0;
						const seconds = t.createdAt ? Math.floor(((t.closedAt - t.createdAt) % 60000) / 1000) : 0;

						const { EmbedBuilder } = require('discord.js');
						const color = 0xFAA81A;
						const statusEmoji = t.status === 'TP' ? '✅' : (t.status === 'SL' ? '🛑' : (t.status === 'BE' ? '🟰' : '❌'));
						const details = [
							t.paire ? String(t.paire) : undefined,
							t.direction ? String(t.direction) : undefined,
							`Risque ${Math.round(((t.risk||0)/0.01)*10)/10}%`,
							`Entrée ${t.entree}`,
							`SL ${t.sl}`,
							`TP ${t.tp}`,
							`RR ${t.rr}`
						].filter(Boolean).join(' · ');
						const embed = new EmbedBuilder()
							.setColor(color)
							.setTitle(t.status === 'CANCEL' ? `Trade annulé ${statusEmoji}` : `Trade clôturé: ${t.status} ${statusEmoji}`)
							.addFields(
								{ name: 'Détails', value: details, inline: false },
								{ name: 'Durée', value: `${minutes}m ${seconds}s`, inline: true },
								{ name: 'Trades', value: String(total), inline: true },
								{ name: 'Winrate', value: `${winrate}%`, inline: true },
								{ name: 'RR cumulé', value: String((Math.round(rrSum * 10) / 10).toFixed(1)) + 'r', inline: true }
							)
							.setTimestamp();
						await msg.reply({ embeds: [embed] }).catch(() => {});

						// Rename thread with count and RR (include adjustments for display)
						try {
							const adj = (data[guildId]?.users?.[userId]?.adjustments) || { tradesDelta: 0, rrDelta: 0 };
							const rrAdj = rrSum + (Number(adj.rrDelta) || 0);
							const rrText = `${rrAdj >= 0 ? '+' : ''}${Number((Math.round(rrAdj * 10) / 10)).toFixed(1)}r`;
							const member = await guild.members.fetch(userId).catch(() => null);
							const display = member ? member.displayName : 'Calls';
							const allCount = (trades || []).length;
							const displayCount = Math.max(0, allCount + (Number(adj.tradesDelta) || 0));
							const newName = `${display} | ${displayCount} Calls | ${rrText}`.slice(0, 100);
							await thread.setName(newName).catch(() => {});
						} catch {}
					}
					// After processing, ensure reactions are present for remaining OPEN trades
					for (const t of trades) {
						if (t.status !== 'OPEN' || !t.messageId) continue;
						const msg = await thread.messages.fetch(t.messageId).catch(() => null);
						if (!msg) continue;
						try {
							for (const e of emojis) {
								if (!msg.reactions.cache.has(e)) await msg.react(e).catch(() => {});
							}
						} catch {}
					}
				}
			}
		} catch (e) {
			console.log(e);
		}
	})();
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