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

const GUILD_ID = process.env.GUILD_ID || '1071775065626132500';
const ADMIN_ROLE_TO_MENTION = process.env.ADMIN_ROLE_TO_MENTION || '1259915050936963176';
const ADMIN_SEND_CHANNEL_ID = process.env.ADMIN_SEND_CHANNEL_ID || '1224388877595447376';
const INIT_ALLOWED_CHANNEL_ID = process.env.INIT_ALLOWED_CHANNEL_ID || '1431276942426116126';

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
    const normalizeRisk = (r) => {
        const v = Number(r) || 0;
        return v > 1 ? v / 100 : v; // support legacy data stored as percent (e.g., 1.5)
    };
    const closed = user.trades.filter(t => t.status === 'TP' || t.status === 'SL' || t.status === 'BE');
    const totalClosed = closed.length;
    let wins = 0; let rrSum = 0;
    for (const t of closed) {
        if (t.status === 'TP') wins += 1;
        const signedR = t.status === 'TP' ? t.rr : (t.status === 'SL' ? -1 : 0);
        const weight = normalizeRisk(t.risk) / 0.01; // 1% = 1.0, 0.5% = 0.5, 2% = 2.0
        rrSum += weight * signedR;
    }
    // apply admin adjustments if any
    const adj = user.adjustments || { tradesDelta: 0, rrDelta: 0, winsDelta: 0 };
    const adjustedTotal = Math.max(0, totalClosed + (Number(adj.tradesDelta) || 0));
    const adjustedRrSum = rrSum + (Number(adj.rrDelta) || 0);
    const winsAdj = Math.min(Math.max(0, wins + (Number(adj.winsDelta) || 0)), totalClosed);
    const denom = Math.max(1, totalClosed);
    const winrate = Math.min(100, Math.max(0, Math.round((winsAdj / denom) * 100)));
    return { total: adjustedTotal, winrate, rrSum: Math.round(adjustedRrSum * 100) / 100 };
}

function rrFromParams(direction, entry, sl, tp) {
    const e = Number(entry), s = Number(sl), t = Number(tp);
    if (direction === 'short') return Math.abs(e - t) / Math.abs(s - e);
    return Math.abs(t - e) / Math.abs(e - s);
}

function determineDirection(entry, sl, tp) {
    const e = Number(entry), s = Number(sl), t = Number(tp);
    if (Number.isNaN(e) || Number.isNaN(s) || Number.isNaN(t)) return null;
    if (t > e && s < e) return 'long';
    if (t < e && s > e) return 'short';
    return null; // incohérent: TP et SL du même côté de l'entrée
}

function validateTradeParams(paire, risquePct, entree, sl, tp) {
    const issues = [];
    if (!paire || typeof paire !== 'string' || !paire.trim()) issues.push('paire invalide');
    if (risquePct == null || Number.isNaN(Number(risquePct)) || risquePct <= 0 || risquePct > 100) issues.push('risque_pct doit être entre 0 et 100');
    if ([entree, sl, tp].some(v => v == null || Number.isNaN(Number(v)) || Number(v) <= 0)) issues.push('entrée/SL/TP doivent être des nombres > 0');
    const direction = determineDirection(entree, sl, tp);
    if (!direction) issues.push('incohérence: pour long TP>entrée & SL<entrée, pour short TP<entrée & SL>entrée');
    return { ok: issues.length === 0, issues, direction };
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
        },
        {
            name: 'edit',
            description: 'Admin: ajuster manuellement le nombre de trades et le RR cumulé',
            type: 1,
            options: [
                { name: 'user', description: 'Utilisateur cible (si hors fil)', type: 6, required: false },
                { name: 'trades_delta', description: 'Variation du nombre de trades (peut être négatif)', type: 4, required: false },
                { name: 'rr_delta', description: 'Variation du RR cumulé (peut être négatif)', type: 10, required: false },
                { name: 'wins_delta', description: 'Variation des gains pour le calcul du winrate (±)', type: 4, required: false }
            ]
        },
        {
            name: 'reset',
            description: 'Admin: recalculer RR et réinitialiser les ajustements (utilisateur ou tous)',
            type: 1,
            options: [
                { name: 'user', description: 'Utilisateur cible (si vide: tous ou fil courant)', type: 6, required: false }
            ]
        },
        {
            name: 'tradeupdate',
            description: 'Mettre à jour un trade (statut, risque, RR)',
            type: 1,
            options: [
                { name: 'trade_id', description: 'ID court du trade (visible dans le footer)', type: 3, required: true },
                { name: 'status', description: 'Nouveau statut', type: 3, required: false, choices: [
                    { name: 'TP', value: 'TP' },
                    { name: 'SL', value: 'SL' },
                    { name: 'BE', value: 'BE' },
                    { name: 'CANCEL', value: 'CANCEL' }
                ]},
                { name: 'risk', description: 'Nouveau risque en % (ex: 2.5)', type: 10, required: false },
                { name: 'rr', description: 'Nouveau RR (ex: 3.5)', type: 10, required: false },
                { name: 'user', description: 'Utilisateur cible (si hors fil)', type: 6, required: false }
            ]
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

            // Envoyer l'embed explicatif des émojis
            const emojiGuide = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('📖 Guide des émojis')
                .setDescription('Utilisez les réactions sur les messages de trades pour clôturer vos positions:')
                .addFields(
                    { name: '✅ TP', value: 'Take Profit - Position fermée en profit', inline: true },
                    { name: '🛑 SL', value: 'Stop Loss - Position fermée en perte', inline: true },
                    { name: '🟰 BE', value: 'Break Even - Position fermée à l\'équilibre', inline: true },
                    { name: '❌ CANCEL', value: 'Annulation - Trade annulé (ne compte pas dans les stats)', inline: true }
                )
                .setFooter({ text: 'Seul l\'auteur du call ou un admin peut clôturer une position' });
            const guideMsg = await thread.send({ embeds: [emojiGuide] });
            await guideMsg.pin();

            return interaction.reply({ content: `Fil créé: <#${thread.id}>`, flags: 64 });
        }

        if (sub === 'trade') {
            const paire = interaction.options.getString('paire');
            const risquePct = Number(interaction.options.getNumber('risque_pct'));
            const entree = Number(interaction.options.getNumber('entree'));
            const sl = Number(interaction.options.getNumber('sl'));
            const tp = Number(interaction.options.getNumber('tp'));
            const image = interaction.options.getAttachment('image');

            const check = validateTradeParams(paire, risquePct, entree, sl, tp);
            if (!check.ok) {
                return interaction.reply({ content: `Paramètres invalides: ${check.issues.join(', ')}`, flags: 64 });
            }
            const direction = check.direction;
            const rr = Math.round(rrFromParams(direction, entree, sl, tp) * 100) / 100;
            let acknowledged = false;
            try {
                await interaction.reply({ content: '...', flags: 64 });
                acknowledged = true;
            } catch (_) {}

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
                    await channel.send({ content: `<@&${ADMIN_ROLE_TO_MENTION}> Nouveau trade!`, allowedMentions: { roles: [ADMIN_ROLE_TO_MENTION] } });
                    await channel.send({ embeds: [embed] });
                    if (acknowledged) await interaction.deleteReply().catch(() => {});
                    return;
                }
                }
            }

            // Non-admin flow: must be inside user thread
            const threadId = servGuild.userThreads[userId];
            if (!threadId || interaction.channelId !== threadId) {
                return interaction.editReply({ content: `Tu n’es pas dans ton fil. Va dans <#${INIT_ALLOWED_CHANNEL_ID}> et fais \/callsend init.` });
            }

            const tradeId = `${Date.now()}`;
            const shortId = Number(tradeId).toString(36).slice(-6).toUpperCase();
            const newTrade = {
                id: tradeId,
                status: 'OPEN',
                risk: (risquePct || 0) / 100,
                rr,
                direction,
                paire,
                entree,
                sl,
                tp,
                shortId
            };
            callData[guildId].users[userId].trades.push(newTrade);

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
                .setFooter({ text: `Trades: ${stats.total} • Winrate: ${stats.winrate}% • RR cumulé: ${stats.rrSum} • ID: ${shortId}` })
                .setTimestamp();

            if (image && image.url) embed.setImage(image.url);

            // mention follower role if exists, then send embed separately via channel messages (no interaction reply)
            const followerRoleId = servGuild.followRoles?.[userId];
            if (followerRoleId) {
                // envoyer la mention sans bloquer l'envoi de l'embed
                interaction.channel.send({ content: `<@&${followerRoleId}> Nouveau trade!`, allowedMentions: { roles: [followerRoleId] } }).catch(() => {});
            }
            const message = await interaction.channel.send({ embeds: [embed] });
            // ajouter les réactions en arrière-plan
            Promise.allSettled([
                message.react('✅'),
                message.react('🛑'),
                message.react('🟰'),
                message.react('❌')
            ]).catch(() => {});

            // store message id to enable reaction-based closing
            const userTrades = callData[guildId].users[userId].trades;
            const idx = userTrades.findIndex(t => t.id === tradeId);
            if (idx !== -1) {
                userTrades[idx].messageId = message.id;
                userTrades[idx].createdAt = userTrades[idx].createdAt || Date.now();
                writeJsonSafe(callDataPath, callData);
            }
            if (acknowledged) await interaction.deleteReply().catch(() => {});
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

            // supprimer les données/stats utilisateur (trades)
            try {
                const data = readJsonSafe(callDataPath);
                if (data[guildId] && data[guildId].users && data[guildId].users[ownerOfThread]) {
                    delete data[guildId].users[ownerOfThread];
                    writeJsonSafe(callDataPath, data);
                }
            } catch (_) {}

            await interaction.reply({ content: `Fil et rôle suiveur supprimés.`, flags: 64 });
            try { await channel.delete('callsend delete'); } catch (_) {}
        }

        if (sub === 'edit') {
            // admin only
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: 'Réservé aux administrateurs.', flags: 64 });
            }
            await interaction.deferReply({ flags: 64 }).catch(() => {});
            // determine target user: thread owner by default, else provided user
            let targetUserId = interaction.options.getUser('user')?.id || null;
            if (!targetUserId) {
                const ch = interaction.channel;
                if (ch && (ch.type === ChannelType.PublicThread || ch.type === ChannelType.PrivateThread)) {
                    for (const [uid, tid] of Object.entries(servGuild.userThreads || {})) {
                        if (tid === ch.id) { targetUserId = uid; break; }
                    }
                }
            }
            if (!targetUserId) {
                return interaction.editReply({ content: 'Spécifie un utilisateur ou exécute la commande dans un fil.' });
            }
            const tradesDelta = interaction.options.getInteger('trades_delta') || 0;
            const rrDelta = interaction.options.getNumber('rr_delta') || 0;
            const winsDelta = interaction.options.getInteger('wins_delta') || 0;
            if (tradesDelta === 0 && rrDelta === 0 && winsDelta === 0) {
                return interaction.editReply({ content: 'Rien à modifier: fournis trades_delta et/ou rr_delta et/ou wins_delta.' });
            }
            const data = readJsonSafe(callDataPath);
            if (!data[guildId]) data[guildId] = { users: {} };
            if (!data[guildId].users[targetUserId]) data[guildId].users[targetUserId] = { trades: [] };
            if (!data[guildId].users[targetUserId].adjustments) data[guildId].users[targetUserId].adjustments = { tradesDelta: 0, rrDelta: 0, winsDelta: 0 };
            data[guildId].users[targetUserId].adjustments.tradesDelta = (data[guildId].users[targetUserId].adjustments.tradesDelta || 0) + tradesDelta;
            data[guildId].users[targetUserId].adjustments.rrDelta = (data[guildId].users[targetUserId].adjustments.rrDelta || 0) + rrDelta;
            data[guildId].users[targetUserId].adjustments.winsDelta = (data[guildId].users[targetUserId].adjustments.winsDelta || 0) + winsDelta;
            writeJsonSafe(callDataPath, data);

            // if in a thread for this user, update thread name with adjusted stats
            const threadId = servGuild.userThreads?.[targetUserId];
            if (threadId && interaction.channelId === threadId) {
                const stats = computeUserStats(data[guildId], targetUserId);
                try {
                    const rrText = `${stats.rrSum >= 0 ? '+' : ''}${Number(stats.rrSum).toFixed(1)}r`;
                    const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
                    const display = member ? member.displayName : 'Calls';
                    const newName = `${display} | ${stats.total} Calls | ${rrText}`.slice(0, 100);
                    await interaction.channel.setName(newName);
                } catch (_) {}
            }
            // Send a public embed summarizing the adjustments
            try {
                const statsAfter = computeUserStats(data[guildId], targetUserId);
                const admin = interaction.user;
                const embed = new EmbedBuilder()
                    .setColor(0xFAA81A)
                    .setTitle('Ajustement de statistiques')
                    .addFields(
                        { name: 'Utilisateur', value: `<@${targetUserId}>`, inline: true },
                        { name: 'Opérateur', value: `<@${admin.id}>`, inline: true },
                        { name: 'Δ Trades', value: String(tradesDelta), inline: true },
                        { name: 'Δ RR', value: String(rrDelta), inline: true },
                        { name: 'Δ Wins (winrate)', value: String(winsDelta), inline: true },
                        { name: 'Nouveaux trades', value: String(statsAfter.total), inline: true },
                        { name: 'Nouveau RR cumulé', value: `${statsAfter.rrSum.toFixed(1)}r`, inline: true },
                        { name: 'Nouveau winrate', value: `${statsAfter.winrate}%`, inline: true }
                    )
                    .setTimestamp();
                await interaction.channel.send({ embeds: [embed] });
            } catch (_) {}
            return interaction.editReply({ content: `Ajustements appliqués à <@${targetUserId}>.` });
        }

        if (sub === 'reset') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: 'Réservé aux administrateurs.', flags: 64 });
            }
            try {
                await interaction.deferReply({ flags: 64 }).catch(() => {});
                await interaction.editReply({ content: 'Reset en cours…' }).catch(() => {});
                const data = readJsonSafe(callDataPath);
                const targetUser = interaction.options.getUser('user');
                const servCfgLive = readJsonSafe(servConfigPath);
                const servGuildLive = ensureGuildContainers(servCfgLive, guildId);
                const userThreads = servGuildLive.userThreads || {};

                const targets = [];
                if (targetUser) {
                    targets.push(targetUser.id);
                } else {
                    // si dans un fil, cibler l’auteur; sinon tous les utilisateurs
                    const ch = interaction.channel;
                    let owner = null;
                    if (ch && (ch.type === ChannelType.PublicThread || ch.type === ChannelType.PrivateThread)) {
                        for (const [uid, tid] of Object.entries(userThreads)) {
                            if (tid === ch.id) { owner = uid; break; }
                        }
                    }
                    if (owner) targets.push(owner);
                    else if (data[guildId]?.users) targets.push(...Object.keys(data[guildId].users));
                }

                let updatedTrades = 0;
                for (const uid of targets) {
                    if (!data[guildId]) data[guildId] = { users: {} };
                    if (!data[guildId].users[uid]) continue;
                    const userData = data[guildId].users[uid];
                    for (const t of userData.trades || []) {
                        if (t.entree != null && t.sl != null && t.tp != null) {
                            const dir = t.direction || determineDirection(t.entree, t.sl, t.tp) || 'long';
                            t.direction = dir;
                            t.rr = Math.round(rrFromParams(dir, Number(t.entree), Number(t.sl), Number(t.tp)) * 100) / 100;
                            updatedTrades++;
                        }
                    }
                    // reset des ajustements
                    userData.adjustments = { tradesDelta: 0, rrDelta: 0, winsDelta: 0 };
                }
                writeJsonSafe(callDataPath, data);

                // Mettre à jour les noms de fils
                for (const uid of targets) {
                    const threadId = userThreads[uid];
                    if (!threadId) continue;
                    try {
                        const thread = interaction.guild.channels.cache.get(threadId) || await interaction.guild.channels.fetch(threadId).catch(() => null);
                        if (!thread) continue;
                        const stats = computeUserStats(data[guildId], uid);
                        const rrText = `${stats.rrSum >= 0 ? '+' : ''}${Number(stats.rrSum).toFixed(1)}r`;
                        const member = await interaction.guild.members.fetch(uid).catch(() => null);
                        const display = member ? member.displayName : 'Calls';
                        const allCount = (data[guildId]?.users?.[uid]?.trades || []).length;
                        const newName = `${display} | ${allCount} Calls | ${rrText}`.slice(0, 100);
                        await thread.setName(newName).catch(() => {});
                    } catch {}
                }

                await interaction.editReply({ content: `Reset terminé. Utilisateurs: ${targets.length}, trades recalculés: ${updatedTrades}.` }).catch(() => {});
            } catch (e) {
                try { await interaction.editReply({ content: `Erreur lors du reset: ${String(e.message || e)}` }); } catch (_) {}
            }
        }

        if (sub === 'tradeupdate') {
            await interaction.deferReply({ flags: 64 }).catch(() => {});
            const shortIdInput = interaction.options.getString('trade_id').trim().toUpperCase();
            const newStatus = interaction.options.getString('status');
            const newRisk = interaction.options.getNumber('risk');
            const newRr = interaction.options.getNumber('rr');
            const explicitUser = interaction.options.getUser('user');
            const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
            const data = readJsonSafe(callDataPath);
            const guildData = data[guildId] || { users: {} };
            let targetUserId = explicitUser?.id || null;
            const servCfgLive = readJsonSafe(servConfigPath);
            const servGuildLive = ensureGuildContainers(servCfgLive, guildId);
            const userThreads = servGuildLive.userThreads || {};

            if (!targetUserId) {
                const ch = interaction.channel;
                if (ch && (ch.type === ChannelType.PublicThread || ch.type === ChannelType.PrivateThread)) {
                    for (const [uid, tid] of Object.entries(userThreads)) {
                        if (tid === ch.id) { targetUserId = uid; break; }
                    }
                }
            }

            let found = null; let ownerId = null;
            const searchUsers = targetUserId ? [targetUserId] : Object.keys(guildData.users || {});
            for (const uid of searchUsers) {
                const udata = guildData.users?.[uid];
                if (!udata) continue;
                const t = (udata.trades || []).find(tr => (tr.shortId || '').toUpperCase() === shortIdInput);
                if (t) { found = t; ownerId = uid; break; }
            }

            if (!found) {
                return interaction.editReply({ content: `Trade introuvable pour l'ID: ${shortIdInput}` });
            }

            // Vérifier les permissions: admin ou auteur dans son fil
            if (!isAdmin && ownerId !== userId) {
                return interaction.editReply({ content: `Vous ne pouvez modifier que vos propres trades ou être admin.` });
            }
            if (!isAdmin && targetUserId && targetUserId !== userId) {
                return interaction.editReply({ content: `Vous ne pouvez modifier que vos propres trades.` });
            }

            // Aucune modification demandée
            if (!newStatus && newRisk == null && newRr == null) {
                return interaction.editReply({ content: `Aucune modification demandée. Spécifiez status, risk ou rr.` });
            }

            let changes = [];
            if (newStatus) {
                if (!['TP','SL','BE','CANCEL'].includes(newStatus)) {
                    return interaction.editReply({ content: `Statut invalide. Utilise TP, SL, BE ou CANCEL.` });
                }
                found.status = newStatus;
                if (newStatus !== 'OPEN') {
                    found.closedAt = found.closedAt || Date.now();
                }
                changes.push(`Statut: ${newStatus}`);
            }
            if (newRisk != null) {
                if (newRisk <= 0 || newRisk > 100) {
                    return interaction.editReply({ content: `Risque invalide. Doit être entre 0 et 100.` });
                }
                found.risk = newRisk / 100;
                changes.push(`Risque: ${newRisk}%`);
            }
            if (newRr != null) {
                if (newRr < 0) {
                    return interaction.editReply({ content: `RR invalide. Doit être >= 0.` });
                }
                found.rr = Math.round(newRr * 100) / 100;
                changes.push(`RR: ${found.rr}`);
            }

            writeJsonSafe(callDataPath, data);

            // Mettre à jour le message et le fil si possible
            try {
                const threadId = userThreads[ownerId];
                const thread = threadId ? (interaction.guild.channels.cache.get(threadId) || await interaction.guild.channels.fetch(threadId).catch(() => null)) : null;
                const msg = (thread && found.messageId) ? (await thread.messages.fetch(found.messageId).catch(() => null)) : null;

                if (newStatus && newStatus !== 'OPEN') {
                    const stats = computeUserStats(data[guildId], ownerId);
                    const color = 0xFAA81A;
                    const statusEmoji = newStatus === 'TP' ? '✅' : (newStatus === 'SL' ? '🛑' : (newStatus === 'BE' ? '🟰' : '❌'));
                    const details = [
                        found.paire ? String(found.paire) : undefined,
                        found.direction ? String(found.direction) : undefined,
                        `Risque ${Math.round((((Number(found.risk)||0) > 1 ? Number(found.risk)/100 : (Number(found.risk)||0))/0.01)*10)/10}%`,
                        `Entrée ${found.entree}`,
                        `SL ${found.sl}`,
                        `TP ${found.tp}`,
                        `RR ${found.rr}`
                    ].filter(Boolean).join(' · ');
                    const embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`Trade clôturé: ${newStatus} ${statusEmoji}`)
                        .addFields(
                            { name: 'Détails', value: details, inline: false },
                            { name: 'Trades', value: String(stats.total), inline: true },
                            { name: 'Winrate', value: `${stats.winrate}%`, inline: true },
                            { name: 'RR cumulé', value: `${stats.rrSum.toFixed(1)}r`, inline: true }
                        )
                        .setTimestamp();
                    if (msg) await msg.reply({ embeds: [embed] });
                }

                if (thread) {
                    const stats = computeUserStats(data[guildId], ownerId);
                    const rrText = `${stats.rrSum >= 0 ? '+' : ''}${Number(stats.rrSum).toFixed(1)}r`;
                    const member = await interaction.guild.members.fetch(ownerId).catch(() => null);
                    const display = member ? member.displayName : 'Calls';
                    const allCount = (data[guildId]?.users?.[ownerId]?.trades || []).length;
                    const newName = `${display} | ${allCount} Calls | ${rrText}`.slice(0, 100);
                    await thread.setName(newName).catch(() => {});
                }
            } catch (_) {}

            return interaction.editReply({ content: `Trade ${shortIdInput} mis à jour: ${changes.join(', ')}.` });
        }
    }
};


