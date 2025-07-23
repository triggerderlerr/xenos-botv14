const { 
    ChannelType, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder,
    PermissionFlagsBits,
    OverwriteType
} = require("discord.js");
const schema = require("../../utils/database/join-to-create");
const fs = require("fs");

class VoiceManager {
    static voiceManager = new Map();
    static backupFile = "./utils/channels.json";
    static checkInterval = null;

    static permissionsRoomOwner = {
        allow: [
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.Stream,
            PermissionFlagsBits.UseVAD,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.PrioritySpeaker,
            PermissionFlagsBits.CreateInstantInvite,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MuteMembers,
            PermissionFlagsBits.MoveMembers
        ],
        deny: []
    };

    constructor(client) {
        this.client = client || null;
        if (this.client) {
            this.setupListeners();
        }
    }

    setupListeners() {
        this.client.on('channelUpdate', async (oldChannel, newChannel) => {
            if (newChannel.type !== ChannelType.GuildVoice) return;
            const backups = this.loadBackup();
            if (!backups[newChannel.guild.id]?.[newChannel.id]) return;

            const permissionsToSave = Array.from(newChannel.permissionOverwrites.cache.values()).map(overwrite => ({
                id: overwrite.id,
                allow: overwrite.allow.toArray(),
                deny: overwrite.deny.toArray(),
                type: overwrite.type
            }));

            backups[newChannel.guild.id][newChannel.id].backupData.permissionOverwrites = permissionsToSave;
            this.saveBackup(backups);
        });

        this.client.once('ready', () => {
            this.checkEmptyChannelsOnStart();
        });
    }

    static loadBackup() {
        if (!fs.existsSync(this.backupFile)) return {};
        return JSON.parse(fs.readFileSync(this.backupFile, "utf-8"));
    }

    static saveBackup(data) {
        fs.writeFileSync(this.backupFile, JSON.stringify(data, null, 2), "utf-8");
    }

    static createModalReplyEmbed(member) {
        return new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("Kanalınızı Özelleştirin")
            .setDescription(
                `Merhaba **${member.user.username}**, ses kanalınızı kişiselleştirmek için aşağıdaki seçeneklerden birini seçin.\n\n` +
                `- **Oda İsmi:** Kanalınızın ismini değiştirmek için.\n` +
                `- **Kullanıcı Limiti:** Kanala kaç kişinin katılabileceğini ayarlamak için.\n` +
                `- **Kilit Durumu Değiştir:** Kanalı kilitlemek veya kilidini açmak için.\n` +
                `- **Görünürlük Değiştir:** Kanalı gizlemek veya görünür yapmak için.\n` +
                `- **Yasak Durumu Değiştir:** Bir kullanıcıyı yasaklamak veya yasağını kaldırmak için.\n` +
                `- **Odadan At:** Odadaki bir kullanıcıyı çıkarmak için.`
            )
            .setThumbnail(member.guild.iconURL())
            .setTimestamp();
    }

    static createInteractionRow() {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ymoderasyon')
            .setPlaceholder('🏷️ Yönetim panelini açmak için tıklayın...')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('İsim Değiştir')
                    .setDescription('Kanalın ismini değiştirir.')
                    .setEmoji("📝")
                    .setValue('rowname'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Kullanıcı Limiti')
                    .setDescription('Kanalın kullanıcı limitini ayarlar.')
                    .setEmoji("👥")
                    .setValue('rowlimit'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Kilit Durumu Değiştir')
                    .setDescription('Kanalı kilitler veya kilidini açar.')
                    .setEmoji("🔐")
                    .setValue('toggleLock'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Görünürlük Değiştir')
                    .setDescription('Kanalı gizler veya görünür yapar.')
                    .setEmoji("👁️")
                    .setValue('toggleVisibility'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Yasak Durumu Değiştir')
                    .setDescription('Bir kullanıcıyı yasaklar veya yasağını kaldırır.')
                    .setEmoji("🚫")
                    .setValue('toggleBan'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Odadan At')
                    .setDescription('Odada bulunan bir kullanıcıyı çıkarır.')
                    .setEmoji("👢")
                    .setValue('kickUser')
            );
        
        return new ActionRowBuilder().addComponents(selectMenu);
    }

    static async onRoomJoin(client, newState) {
        const { member, channel, guild } = newState;
        if (!member || !guild || !channel) return;

        const data = await schema.findOne({ Guild: guild.id });
        if (!data) return;

        const channelid = data.Channel;
        const joinChannel = client.channels.cache.get(channelid);
        if (!joinChannel || channel.id !== channelid) return;

        let backups = this.loadBackup();
        let voiceChannel;
        let backupEntry;

        if (backups[guild.id]) {
            for (const key in backups[guild.id]) {
                if (backups[guild.id][key].owner === member.id) {
                    backupEntry = backups[guild.id][key];
                    delete backups[guild.id][key];
                    break;
                }
            }
        }

        if (backupEntry && backupEntry.backupData) {
            const backupData = backupEntry.backupData;
            voiceChannel = await guild.channels.create({
                name: backupData.name,
                type: ChannelType.GuildVoice,
                parent: backupData.parent,
                permissionOverwrites: backupData.permissionOverwrites.map(o => ({
                    id: o.id,
                    allow: o.allow,
                    deny: o.deny
                })),
                userLimit: backupData.userLimit
            });
        } else {
            voiceChannel = await guild.channels.create({
                name: `${member.user.username}'s Room`,
                type: ChannelType.GuildVoice,
                parent: channel.parent,
                permissionOverwrites: [
                    {
                        id: member.id,
                        allow: this.permissionsRoomOwner.allow,
                        deny: this.permissionsRoomOwner.deny,
                        type: OverwriteType.Member
                    },
                    {
                        id: guild.id,
                        allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
                    },
                ],
                userLimit: data.UserLimit || 0,
                reason: 'Özel oda oluşturuluyor'
            });
        }

        backups[guild.id] = backups[guild.id] || {};
        backups[guild.id][voiceChannel.id] = {
            owner: member.id,
            backupData: {
                name: voiceChannel.name,
                parent: voiceChannel.parentId,
                userLimit: voiceChannel.userLimit,
                permissionOverwrites: Array.from(voiceChannel.permissionOverwrites.cache.values()).map(o => ({
                    id: o.id,
                    allow: o.allow.toArray(),
                    deny: o.deny.toArray(),
                    type: o.type
                }))
            }
        };
        this.saveBackup(backups);

        this.voiceManager.set(member.id, voiceChannel.id);

        setTimeout(async () => {
            const channelCheck = client.channels.cache.get(voiceChannel.id);
            if (channelCheck) {
                try {
                    await member.voice.setChannel(voiceChannel);
                } catch (error) {
                    console.error("Kanal ayarlarken hata:", error);
                    await voiceChannel.delete('Özel odalar için DDoS koruması').catch(() => {});
                }
            } else {
                console.warn("Kanal bulunamadı, muhtemelen silinmiş.");
            }
        }, 500);

        setTimeout(() => {
            const row = this.createInteractionRow();
            voiceChannel.send({
                embeds: [this.createModalReplyEmbed(member)],
                components: [row],
            }).catch(console.error);
        }, 500);
    }

    static async onRoomLeave(client, oldState) {
        const { member, channel, guild } = oldState;
        if (!member || !guild || !channel) return;

        const voiceChannelId = this.voiceManager.get(member.id);
        
        if (!voiceChannelId || channel.id !== voiceChannelId) return;

        let backups = this.loadBackup();
        const channelData = backups[channel.guild.id]?.[channel.id];
        const isOwner = channelData?.owner === member.id;

        if (channel.members.size === 0 && isOwner) {
            backups[channel.guild.id] = backups[channel.guild.id] || {};
            backups[channel.guild.id][channel.id] = {
                owner: member.id,
                backupData: {
                    name: channel.name,
                    parent: channel.parentId,
                    userLimit: channel.userLimit,
                    permissionOverwrites: Array.from(channel.permissionOverwrites.cache.values()).map(o => ({
                        id: o.id,
                        allow: o.allow.toArray(),
                        deny: o.deny.toArray(),
                        type: o.type
                    }))
                }
            };
            this.saveBackup(backups);

            this.voiceManager.delete(member.id);
            try {
                await channel.delete('Odanın terk edilmesi');
            } catch (error) {
                console.error('Kanal silinirken hata:', error);
            }
        } else {
            this.voiceManager.delete(member.id);
        }
    }

    static async checkEmptyChannels(client, oldState) {
        const { guild } = oldState;
        if (!guild) return;

        const backups = this.loadBackup();

        for (const channelId in backups[guild.id]) {
            const channel = guild.channels.cache.get(channelId);
            if (!channel) continue;

            const channelData = backups[guild.id][channelId];
            const ownerId = channelData.owner;
            const ownerInChannel = channel.members.has(ownerId);

            if (channel.members.size === 0 && !ownerInChannel) {
                backups[guild.id][channelId] = {
                    owner: ownerId,
                    backupData: {
                        name: channel.name,
                        parent: channel.parentId,
                        userLimit: channel.userLimit,
                        permissionOverwrites: Array.from(channel.permissionOverwrites.cache.values()).map(o => ({
                            id: o.id,
                            allow: o.allow.toArray(),
                            deny: o.deny.toArray(),
                            type: o.type
                        }))
                    }
                };
                this.saveBackup(backups);

                try {
                    await channel.delete('Sahipsiz ve boş oda temizliği');
                } catch (error) {
                    console.error(`Oda silinirken hata: ${channel.name}`, error);
                }
            }
        }
    }

    async checkEmptyChannelsOnStart() {
        const backups = VoiceManager.loadBackup();
        
        for (const guildId in backups) {
            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) continue;

            for (const channelId in backups[guildId]) {
                const channel = guild.channels.cache.get(channelId);
                if (!channel) continue;

                const channelData = backups[guildId][channelId];
                const ownerId = channelData.owner;
                const ownerInChannel = channel.members.has(ownerId);

                if (channel.members.size === 0 && !ownerInChannel) {
                    backups[guildId][channelId] = {
                        owner: ownerId,
                        backupData: {
                            name: channel.name,
                            parent: channel.parentId,
                            userLimit: channel.userLimit,
                            permissionOverwrites: Array.from(channel.permissionOverwrites.cache.values()).map(o => ({
                                id: o.id,
                                allow: o.allow.toArray(),
                                deny: o.deny.toArray(),
                                type: o.type
                            }))
                        }
                    };
                    VoiceManager.saveBackup(backups);

                    try {
                        await channel.delete('Bot başlatıldığında sahipsiz ve boş oda temizliği');
                    } catch (error) {
                        console.error(`Oda silinirken hata: ${channel.name}`, error);
                    }
                }
            }
        }
    }
}

module.exports = VoiceManager;