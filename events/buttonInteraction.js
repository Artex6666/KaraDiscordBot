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
            const isAdmin = interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator);
            if (interaction.user.id !== ownerId && !isAdmin) {
                return interaction.reply({ content: `Seul l’auteur du call (ou un admin) peut clôturer cette position.`, flags: 64 });
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
        // Only author or admin can close via reaction
        const member = await msg.guild.members.fetch(user.id).catch(() => null);
        const isAdmin = member?.permissions?.has(PermissionsBitField.Flags.Administrator);
        if (user.id !== ownerId && !isAdmin) return;

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
            const trades = (g.users?.[ownerId]?.trades) || [];
            const closed = trades.filter(t => t.status !== 'OPEN');
            let wins = 0; let rrSum = 0;
            for (const t of closed) {
                if (t.status === 'TP') wins += 1;
                const signed = t.status === 'TP' ? t.rr : (t.status === 'SL' ? -1 : 0);
                const weight = (t.risk || 0) / 0.01; // risk stored as fraction (e.g. 0.015 => 1.5)
                rrSum += weight * signed;
            }
            const total = closed.length;
            const winrate = total ? Math.round((wins / total) * 100) : 0;
            return { total, winrate, rrSum: Math.round(rrSum * 100) / 100 };
        })();

        const color = 0xFAA81A; // orange
        const statusEmoji = found.status === 'TP' ? '✅' : (found.status === 'SL' ? '🛑' : '🟰');
        const details = [
            found.paire ? String(found.paire) : undefined,
            found.direction ? String(found.direction) : undefined,
            `Risque ${Math.round(((found.risk||0)/0.01)*10)/10}%`,
            `Entrée ${found.entree}`,
            `SL ${found.sl}`,
            `TP ${found.tp}`,
            `RR ${found.rr}`
        ].filter(Boolean).join(' · ');

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`Trade clôturé: ${found.status} ${statusEmoji}`)
            .addFields(
                { name: 'Détails', value: details, inline: false },
                { name: 'Durée', value: `${minutes}m ${seconds}s`, inline: true },
                { name: 'Trades', value: String(stats.total), inline: true },
                { name: 'Winrate', value: `${stats.winrate}%`, inline: true },
                { name: 'RR cumulé', value: String(stats.rrSum.toFixed(1)) + 'r', inline: true }
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
