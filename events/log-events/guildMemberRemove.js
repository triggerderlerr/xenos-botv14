const { Client, AuditLogEvent, EmbedBuilder } = require("discord.js");
const db = require("croxydb");
const messages = require('../../utils/constants/messages');
const embedBuilder = require("../../utils/helpers/embeds");

module.exports = async (client, member) => {
    // Log durumu kapalıysa hiçbir API çağrısı / kontrol yapma
    const logdurum = db.get(`logdurum_${member.guild.id}`);
    if (logdurum !== 'açık') return;

    const logchannel = db.get(`logchannels_${member.guild.id}`);
    const kanal = member.guild.channels.cache.get(logchannel);
    if (!kanal) return;

    var date = Date.now();

    let fetchedLogs;
    try {
        fetchedLogs = await member.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MemberKick,
        });
    } catch (error) {
        return console.error(`Audit log alınırken hata: ${error}`);
    }

    const kickLog = fetchedLogs.entries.first();

    if (!kickLog) return console.log(`${member.user.tag} left the guild, most likely of their own will.`);

    const { executor, target } = kickLog;

    // left system
    if (member.joinedAt && kickLog.createdAt < member.joinedAt) {
        return kanal.send({
            embeds: [embedBuilder.guildMR(client, member)],
        });
    }

    // kick system
    if (target && target.id === member.id) {
        const membeds = new EmbedBuilder()
            .setColor("Random")
            .setAuthor({
                name: `${client.user.username} | Sunucudan Atıldı`,
                iconURL: client.user.displayAvatarURL({ dynamic: true, size: 4096 }),
            })
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 4096 }))
            .setDescription(
                [`**${member.user.username}** sunucudan atıldı`].join("\n")
            )
            .addFields(
                { name: `Atılan`, value: `${member.user.username}`, inline: true },
                { name: `Atan`, value: `${executor.tag}`, inline: true },
                { name: `Zaman`, value: `<t:${parseInt(date / 1000)}:R>`, inline: true }
            );
        await kanal.send({
            embeds: [membeds],
        });
    } else {
        console.log(`${member.user.tag} left the guild, audit log fetch was inconclusive.`);
    }
};