const fs = require('fs');
const path = require('path');
const {
    SlashCommandBuilder,
    EmbedBuilder,
    ChannelType,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle,
    PermissionsBitField
} = require('discord.js');

const GUILD_ID = '1071775065626132500';
const ADMIN_ROLE_TO_MENTION = '1259915050936963176';
const ADMIN_SEND_CHANNEL_ID = '1224388877595447376';
const INIT_ALLOWED_CHANNEL_ID = '1431276942426116126';

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

function ensureGuildContainers(obj, guildId) {
    if (!obj[guildId]) obj[guildId] = {};
    return obj[guildId];
}

function computeUserStats(callDataGuild, userId) {
    const user = callDataGuild.users?.[userId];
    if (!user || !user.trades) return { total: 0, winrate: 0, rrSum: 0 };
    const closed = user.trades.filter(t => t.status !== 'OPEN');
    const total = closed.length;
    let wins = 0; let rrSum = 0;
    for (const t of closed) {
        if (t.status === 'TP') wins += 1;
        const signedR = t.status === 'TP' ? t.rr : (t.status === 'SL' ? -1 : 0);
        rrSum += (t.risk || 1) * signedR;
    }
    return { total, winrate: total ? Math.round((wins / total) * 100) : 0, rrSum: Math.round(rrSum * 100) / 100 };
}

function rrFromParams(direction, entry, sl, tp) {
    const e = Number(entry), s = Number(sl), t = Number(tp);
    if (direction === 'short') return Math.abs(e - t) / Math.abs(s - e);
    return Math.abs(t - e) / Math.abs(e - s);
}

function determineDirection(entry, sl, tp) {
    const e = Number(entry), s = Number(sl), t = Number(tp);
    if (t > e && s < e) return 'long';
    if (t < e && s > e) return 'short';
    return t > e ? 'long' : 'short';
}

module.exports = {
    name: 'callsend',
    description: 'Envoyer/initialiser des calls de trading',
    type: 1,
    options: [
        {
            name: 'init',
            description: 'Créer le fil personnel de calls',
            type: 1
        },
        {
            name: 'trade',
            description: 'Publier un nouveau trade',
            type: 1,
            options: [
                { name: 'paire', description: 'Ex: EUR/USD', type: 3, required: true },
                { name: 'risque_pct', description: 'Risque en % (ex: 2)', type: 10, required: true },
                { name: 'entree', description: 'Prix d’entrée', type: 10, required: true },
                { name: 'sl', description: 'Stop Loss', type: 10, required: true },
                { name: 'tp', description: 'Take Profit', type: 10, required: true },
                { name: 'image', description: 'Image/graphique du trade', type: 11, required: false }
            ]
        },
        {
            name: 'delete',
            description: 'Supprimer le fil de calls courant et le rôle suiveur',
            type: 1
        }
    ],
    default_member_permissions: null,
    cooldown: 2000,
    run: async (client, interaction) => {
        if (!interaction.isChatInputCommand()) return;

        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const member = interaction.member;
        const userId = interaction.user.id;

        // ensure files
        const servCfg = readJsonSafe(servConfigPath);
        const servGuild = ensureGuildContainers(servCfg, guildId);
        if (!servGuild.followRoles) servGuild.followRoles = {};
        if (!servGuild.userThreads) servGuild.userThreads = {};
        writeJsonSafe(servConfigPath, servCfg);

        const callData = readJsonSafe(callDataPath);
        if (!callData[guildId]) callData[guildId] = { users: {} };
        if (!callData[guildId].users[userId]) callData[guildId].users[userId] = { trades: [] };

        if (sub === 'init') {
            if (interaction.channelId !== INIT_ALLOWED_CHANNEL_ID) {
                return interaction.reply({ content: `Utilise cette commande dans <#${INIT_ALLOWED_CHANNEL_ID}>.`, flags: 64 });
            }
            if (servGuild.userThreads[userId]) {
                const existing = interaction.guild.channels.cache.get(servGuild.userThreads[userId]);
                if (existing) {
                    return interaction.reply({ content: `Tu as déjà un fil. Supprime l’ancien avant d’en créer un nouveau.`, ephemeral: true });
                }
            }

            // create follow role for the user if missing
            let roleId = servGuild.followRoles[userId];
            let role = roleId ? interaction.guild.roles.cache.get(roleId) : null;
            const roleName = `${interaction.member.displayName} calls`;
            if (!role) {
                role = await interaction.guild.roles.create({ name: roleName, mentionable: true });
                servGuild.followRoles[userId] = role.id;
                writeJsonSafe(servConfigPath, servCfg);
            }

            const baseChannel = interaction.channel;
            const thread = await baseChannel.threads.create({
                name: `${interaction.member.displayName} Calls`,
                autoArchiveDuration: 10080,
                type: ChannelType.PublicThread
            });
            servGuild.userThreads[userId] = thread.id;
            writeJsonSafe(servConfigPath, servCfg);

            const followBtn = new ButtonBuilder()
                .setCustomId(`calls_follow_${userId}`)
                .setLabel(`Suivre ${interaction.member.displayName}`)
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(followBtn);

            const welcome = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle(`Channel de calls de ${interaction.member.displayName}`)
                .setDescription(`Voici le channel de calls de ${interaction.user}.\nSi vous souhaitez être notifié à chaque nouveau call, cliquez sur le bouton ci-dessous.\n\n_Disclaimer_: Les positions partagées ici sont à titre indicatif. Les potentielles pertes n'engagent que vous.`);

            const pinned = await thread.send({ embeds: [welcome], components: [row] });
            await pinned.pin();

            return interaction.reply({ content: `Fil créé: <#${thread.id}>`, flags: 64 });
        }

        if (sub === 'trade') {
            const paire = interaction.options.getString('paire');
            const risquePct = Number(interaction.options.getNumber('risque_pct'));
            const entree = Number(interaction.options.getNumber('entree'));
            const sl = Number(interaction.options.getNumber('sl'));
            const tp = Number(interaction.options.getNumber('tp'));
            const image = interaction.options.getAttachment('image');

            const direction = determineDirection(entree, sl, tp);
            const rr = Math.round(rrFromParams(direction, entree, sl, tp) * 100) / 100;

            // Admin fast-send to fixed channel in target guild, unless inside own thread
            if (guildId === GUILD_ID && interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                const isOwnThread = servGuild.userThreads[userId] && interaction.channelId === servGuild.userThreads[userId];
                if (!isOwnThread) {
                const channel = interaction.guild.channels.cache.get(ADMIN_SEND_CHANNEL_ID);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setColor(0xED4245)
                        .setTitle('🚨 NOUVEAU TRADE 🚨')
                        .addFields(
                            { name: 'Paire', value: String(paire), inline: true },
                            { name: 'Direction', value: String(direction), inline: true },
                            { name: 'Risque', value: `${risquePct}%`, inline: true },
                            { name: 'Entrée', value: String(entree), inline: true },
                            { name: 'Stop Loss (SL)', value: String(sl), inline: true },
                            { name: 'Take Profit (TP)', value: String(tp), inline: true },
                            { name: 'Risk/Reward (RR)', value: String(rr), inline: true }
                        )
                        .setTimestamp();

                    if (image && image.url) embed.setImage(image.url);
                    await channel.send({ content: `<@&${ADMIN_ROLE_TO_MENTION}>`, embeds: [embed] });
                    return interaction.reply({ content: `Call envoyé dans <#${ADMIN_SEND_CHANNEL_ID}>`, flags: 64 });
                }
                }
            }

            // Non-admin flow: must be inside user thread
            const threadId = servGuild.userThreads[userId];
            if (!threadId || interaction.channelId !== threadId) {
                return interaction.reply({ content: `Tu n’es pas dans ton fil. Va dans <#${INIT_ALLOWED_CHANNEL_ID}> et fais \/callsend init.`, flags: 64 });
            }

            const tradeId = `${Date.now()}`;
            callData[guildId].users[userId].trades.push({
                id: tradeId,
                status: 'OPEN',
                risk: (risquePct || 0) / 100,
                rr,
                direction,
                paire,
                entree,
                sl,
                tp
            });
            writeJsonSafe(callDataPath, callData);

            const stats = computeUserStats(callData[guildId], userId);
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('🚨 NOUVEAU TRADE 🚨')
                .addFields(
                    { name: 'Paire', value: String(paire), inline: true },
                    { name: 'Direction', value: String(direction), inline: true },
                    { name: 'Risque', value: `${risquePct}%`, inline: true },
                    { name: 'Entrée', value: String(entree), inline: true },
                    { name: 'Stop Loss (SL)', value: String(sl), inline: true },
                    { name: 'Take Profit (TP)', value: String(tp), inline: true },
                    { name: 'Risk/Reward (RR)', value: String(rr), inline: true }
                )
                .setFooter({ text: `Trades: ${stats.total} • Winrate: ${stats.winrate}% • RR cumulé: ${stats.rrSum}` })
                .setTimestamp();

            if (image && image.url) embed.setImage(image.url);

            const message = await interaction.reply({ embeds: [embed], fetchReply: true });
            try {
                await message.react('✅');
                await message.react('🛑');
                await message.react('🟰');
            } catch (_) {}

            // store message id to enable reaction-based closing
            const userTrades = callData[guildId].users[userId].trades;
            const idx = userTrades.findIndex(t => t.id === tradeId);
            if (idx !== -1) {
                userTrades[idx].messageId = message.id;
                userTrades[idx].createdAt = userTrades[idx].createdAt || Date.now();
                writeJsonSafe(callDataPath, callData);
            }
        }

        if (sub === 'delete') {
            const channel = interaction.channel;
            if (!channel || (channel.type !== ChannelType.PublicThread && channel.type !== ChannelType.PrivateThread)) {
                return interaction.reply({ content: `Exécute cette commande depuis le fil à supprimer.`, flags: 64 });
            }
            // identifier propriétaire du fil
            let ownerOfThread = null;
            for (const [uid, tid] of Object.entries(servGuild.userThreads || {})) {
                if (tid === channel.id) { ownerOfThread = uid; break; }
            }
            if (!ownerOfThread) {
                return interaction.reply({ content: `Ce fil n'est pas reconnu comme fil de calls.`, flags: 64 });
            }
            const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
            if (!isAdmin && interaction.user.id !== ownerOfThread) {
                return interaction.reply({ content: `Vous ne pouvez supprimer que votre propre fil.`, flags: 64 });
            }

            // supprimer rôle suiveur du propriétaire
            const roleId = servGuild.followRoles?.[ownerOfThread];
            if (roleId) {
                const role = interaction.guild.roles.cache.get(roleId);
                try { if (role) await role.delete('callsend delete'); } catch (_) {}
                if (servGuild.followRoles) delete servGuild.followRoles[ownerOfThread];
            }
            if (servGuild.userThreads) delete servGuild.userThreads[ownerOfThread];
            writeJsonSafe(servConfigPath, servCfg);

            await interaction.reply({ content: `Fil et rôle suiveur supprimés.`, flags: 64 });
            try { await channel.delete('callsend delete'); } catch (_) {}
        }
    }
};


