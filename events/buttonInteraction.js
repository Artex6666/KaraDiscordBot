const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const client = require('..');
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

client.on('interactionCreate', async interaction => {
	if (!interaction.isButton()) return;

    const button = client.buttons.get(interaction.customId);
    if (button) {
        try {
            if(button.permissions) {
                if(!interaction.memberPermissions.has(PermissionsBitField.resolve(button.permissions || []))) {
                    const perms = new EmbedBuilder()
                    .setDescription(`🚫 ${interaction.user}, You don't have \`${button.permissions}\` permissions to interact this button!`)
                    .setColor('Red')
                    return interaction.reply({ embeds: [perms], ephemeral: true })
                }
            }
            return await button.run(client, interaction);
        } catch (error) {
            console.log(error);
        }
        return;
    }

    // Dynamic buttons for follow and trade status
    try {
        const id = interaction.customId;
        if (id.startsWith('calls_follow_')) {
            const userId = id.split('calls_follow_')[1];
            const servCfg = readJsonSafe(servConfigPath);
            const guildId = interaction.guildId;
            if (!servCfg[guildId]) servCfg[guildId] = {};
            const roleId = servCfg[guildId].followRoles?.[userId];
            if (!roleId) return interaction.reply({ content: 'Rôle indisponible.', ephemeral: true });
            const role = interaction.guild.roles.cache.get(roleId);
            if (!role) return interaction.reply({ content: 'Rôle introuvable.', ephemeral: true });
            const has = interaction.member.roles.cache.has(role.id);
            if (has) {
                await interaction.member.roles.remove(role);
                return interaction.reply({ content: `Rôle retiré: <@&${role.id}>`, flags: 64 });
            } else {
                await interaction.member.roles.add(role);
                return interaction.reply({ content: `Rôle ajouté: <@&${role.id}>`, flags: 64 });
            }
        }

        if (id.startsWith('calls_trade_')) {
            const parts = id.split('_');
            const action = parts[2];
            const tradeId = parts[3];
            const ownerId = parts[4];
            if (interaction.user.id !== ownerId) {
                return interaction.reply({ content: `Seul l’auteur du call peut clôturer sa position.`, flags: 64 });
            }
            const callData = readJsonSafe(callDataPath);
            const guildId = interaction.guildId;
            const user = callData[guildId]?.users?.[ownerId];
            if (!user) return interaction.reply({ content: 'Données introuvables.', flags: 64 });
            const trade = user.trades.find(t => t.id === tradeId);
            if (!trade) return interaction.reply({ content: 'Trade introuvable.', flags: 64 });
            if (trade.status !== 'OPEN') return interaction.reply({ content: 'Ce trade est déjà clôturé.', flags: 64 });
            if (action === 'tp') trade.status = 'TP';
            if (action === 'sl') trade.status = 'SL';
            if (action === 'be') trade.status = 'BE';
            writeJsonSafe(callDataPath, callData);
            return interaction.reply({ content: `Position fermée: ${trade.status} pris en compte.`, flags: 64 });
        }
    } catch (e) {
        console.log(e);
    }

    // Unknown button
});

// Reaction-based TP/SL/BE handling
client.on('messageReactionAdd', async (reaction, user) => {
    try {
        if (user.bot) return;
        const emoji = reaction.emoji.name;
        if (!['✅','🛑','🟰'].includes(emoji)) return;
        const msg = reaction.message;
        const guildId = msg.guildId;
        if (!guildId) return;
        const callData = readJsonSafe(callDataPath);
        const guild = callData[guildId];
        if (!guild) return;
        // find trade by messageId
        let found = null; let ownerId = null;
        for (const [uid, data] of Object.entries(guild.users || {})) {
            const t = (data.trades || []).find(tr => tr.messageId === msg.id);
            if (t) { found = t; ownerId = uid; break; }
        }
        if (!found) return;
        if (user.id !== ownerId) return; // only author can close

        if (found.status !== 'OPEN') return;
        if (emoji === '✅') found.status = 'TP';
        if (emoji === '🛑') found.status = 'SL';
        if (emoji === '🟰') found.status = 'BE';
        found.closedAt = Date.now();
        writeJsonSafe(callDataPath, callData);

        // compute stats & duration
        const durationMs = found.createdAt ? (found.closedAt - found.createdAt) : 0;
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);

        const stats = (() => {
            const g = callData[guildId];
            // temp mutate status already set above
            const userStats = { users: { [ownerId]: { trades: (g.users?.[ownerId]?.trades)||[] } } };
            return {
                total: (g.users?.[ownerId]?.trades||[]).filter(t=>t.status!=='OPEN').length,
                ...((() => { const u = g.users?.[ownerId]; if(!u) return {winrate:0,rrSum:0}; let wins=0, rrSum=0; for(const t of u.trades){ if(t.status!=='OPEN'){ if(t.status==='TP') wins++; const signed=t.status==='TP'?t.rr:(t.status==='SL'?-1:0); rrSum += (t.risk||1)*signed; } } return { winrate: ((wins/Math.max(1,(g.users?.[ownerId]?.trades||[]).filter(t=>t.status!=='OPEN').length))*100)|0, rrSum: Math.round(rrSum*100)/100 }; })())
            };
        })();

        const color = 0xFAA81A; // orange
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle('Position clôturée')
            .setDescription(`Statut: ${found.status}`)
            .addFields(
                { name: 'Durée', value: `${minutes}m ${seconds}s`, inline: true },
                { name: 'Trades', value: String(stats.total), inline: true },
                { name: 'Winrate', value: `${stats.winrate}%`, inline: true },
                { name: 'RR cumulé', value: String(stats.rrSum), inline: true }
            )
            .setTimestamp();

        await msg.reply({ embeds: [embed] });

        // Rename thread with cumulative RR
        try {
            const rrText = `${stats.rrSum >= 0 ? '+' : ''}${Number(stats.rrSum).toFixed(1)}r`;
            const ch = msg.channel;
            if (ch && (ch.isThread?.() || ch.type === 11 || ch.type === 12)) {
                const member = await msg.guild.members.fetch(ownerId).catch(() => null);
                const display = member ? member.displayName : 'Calls';
                const newName = `${display} Calls | ${rrText}`.slice(0, 100);
                await ch.setName(newName);
            }
        } catch (e) { console.log(e); }
    } catch (e) {
        console.log(e);
    }
});
