const { PermissionsBitField, ChannelType, EmbedBuilder } = require("discord.js");
const db = require("croxydb");

const RECORD_KEY = (guildId) => `kayıtkur_${guildId}`;
const KAYIT_CATEGORY = "KAYIT";

const REGISTER_KEYS = (guildId) => [
  `erkek_${guildId}`,
  `erkek2_${guildId}`,
  `kadın_${guildId}`,
  `kadın2_${guildId}`,
  `otorol_${guildId}`,
  `kayityetkili_${guildId}`,
  `kayitkanal_${guildId}`
];

module.exports = {
  name: "kayıt-kur",
  description: "Kayıt sistemi altyapısını kurar; tekrar kullanılırsa kurduklarını siler.",
  type: 1,
  options: [],

  run: async (client, interaction) => {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "Bu komutu kullanmak için Yönetici yetkisine sahip olmalısın!", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const record = db.get(RECORD_KEY(interaction.guild.id));
    if (record) return teardown(interaction, record);
    return setup(interaction);
  }
};

// ---------------- KURULUM ----------------
async function setup(interaction) {
  const guild = interaction.guild;
  const guildId = guild.id;
  const everyone = guild.roles.everyone;

  const createdRoles = [];
  const createdChannels = [];
  const restricted = [];

  const resolveRole = async (dbKey, name, color) => {
    // 1) Veritabanında ayarlı rol varsa onu kullan
    const configuredId = db.get(dbKey);
    if (configuredId) {
      const configured = guild.roles.cache.get(configuredId);
      if (configured) return configured;
    }
    // 2) Aynı isimde rol varsa onu kullan
    const existing = guild.roles.cache.find(r => r.name === name && !r.managed);
    if (existing) return existing;
    // 3) Yoksa oluştur
    const role = await guild.roles.create({
      name,
      color,
      mentionable: true,
      reason: "Kayıt sistemi kurulumu"
    });
    createdRoles.push(role.id);
    return role;
  };

  try {
    const erkekRol = await resolveRole(`erkek_${guildId}`, "Erkek", "#3498DB");
    const kadınRol = await resolveRole(`kadın_${guildId}`, "Kadın", "#E91E63");
    const kayıtsızRol = await resolveRole(`otorol_${guildId}`, "Kayıtsız", "#95A5A6");
    const yetkiliRol = await resolveRole(`kayityetkili_${guildId}`, "Kayıt Yetkilisi", "#2ECC71");

    // Kayıt kanalı: db'de ayarlıysa onu kullan, yoksa isimden bul, o da yoksa oluştur
    let kayıtKanal = null;
    const configuredChannelId = db.get(`kayitkanal_${guildId}`);
    if (configuredChannelId) {
      const ch = guild.channels.cache.get(configuredChannelId);
      if (ch && ch.isTextBased()) kayıtKanal = ch;
    }
    if (!kayıtKanal) {
      kayıtKanal = guild.channels.cache.find(c => c.name === "kayıt-sohbet" && c.isTextBased());
    }

    // Kategori: kayıt kanalının kategorisi, yoksa KAYIT adında kategori, o da yoksa oluştur
    let category = kayıtKanal?.parent || guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === KAYIT_CATEGORY);
    if (!category) {
      category = await guild.channels.create({
        name: KAYIT_CATEGORY,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: everyone.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak]
          },
          {
            id: kayıtsızRol.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak]
          },
          {
            id: yetkiliRol.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ManageChannels]
          }
        ],
        reason: "Kayıt sistemi kurulumu"
      });
      createdChannels.push(category.id);
    } else {
      // Mevcut kategori kullanılıyorsa kayıtsız rolünün görünürlüğünü garantiye al
      try {
        await category.permissionOverwrites.edit(kayıtsızRol.id, { ViewChannel: true, Connect: true });
      } catch {}
    }

    // Kayıt kanalı yoksa kategori altında oluştur
    if (!kayıtKanal) {
      kayıtKanal = await guild.channels.create({
        name: "kayıt-sohbet",
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          {
            id: everyone.id,
            deny: [PermissionsBitField.Flags.SendMessages],
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory]
          },
          {
            id: kayıtsızRol.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory]
          },
          {
            id: yetkiliRol.id,
            allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ManageChannels]
          }
        ],
        topic: "Kayıt işlemleri ve hoş geldin mesajları bu kanala gelir.",
        reason: "Kayıt sistemi kurulumu"
      });
      createdChannels.push(kayıtKanal.id);
    } else if (kayıtKanal.parentId !== category.id) {
      // Ayarlı kanal başka yerdeyse kayıt kategorisine taşı
      try {
        await kayıtKanal.setParent(category.id);
      } catch {}
    }

    // Teyit odaları (kayıt kategorisi altında bul veya oluştur)
    const voiceChannels = [];
    for (const name of ["Teyit 1", "Teyit 2"]) {
      let vc = guild.channels.cache.find(c => c.name === name && c.isVoiceBased() && c.parentId === category.id);
      if (!vc) {
        vc = await guild.channels.create({
          name,
          type: ChannelType.GuildVoice,
          parent: category.id,
          permissionOverwrites: [
            {
              id: everyone.id,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak]
            },
            {
              id: kayıtsızRol.id,
              allow: [PermissionsBitField.Flags.Connect]
            }
          ],
          reason: "Kayıt sistemi kurulumu"
        });
        createdChannels.push(vc.id);
      }
      voiceChannels.push(vc);
    }

    // Kayıtsız rolü KAYIT dışındaki tüm kanalları göremesin
    for (const channel of guild.channels.cache.values()) {
      if (channel.id === category.id) continue;
      if (channel.parentId === category.id) continue;
      try {
        await channel.permissionOverwrites.edit(kayıtsızRol.id, { ViewChannel: false });
        restricted.push(channel.id);
      } catch {
        // Botun yetkisi olmayan kanallar (kurallar vb.) atlanır
      }
    }

    // Veritabanı
    db.set(`erkek_${guildId}`, erkekRol.id);
    db.set(`erkek2_${guildId}`, erkekRol.id);
    db.set(`kadın_${guildId}`, kadınRol.id);
    db.set(`kadın2_${guildId}`, kadınRol.id);
    db.set(`otorol_${guildId}`, kayıtsızRol.id);
    db.set(`kayityetkili_${guildId}`, yetkiliRol.id);
    db.set(`kayitkanal_${guildId}`, kayıtKanal.id);

    db.set(RECORD_KEY(guildId), {
      kayitsizRoleId: kayıtsızRol.id,
      createdRoles,
      createdChannels,
      restricted
    });

    const embed = new EmbedBuilder()
      .setColor("#2ECC71")
      .setTitle("Kayıt Sistemi Kuruldu")
      .setDescription(`Kayıt sistemi **${guild.name}** sunucusunda kuruldu. Komutu tekrar çalıştırırsan oluşturduklarını siler.`)
      .addFields(
        {
          name: "📛 Roller",
          value:
            `• Kayıtsız: <@&${kayıtsızRol.id}>\n` +
            `• Kayıt Yetkilisi: <@&${yetkiliRol.id}>\n` +
            `• Erkek: <@&${erkekRol.id}>\n` +
            `• Kadın: <@&${kadınRol.id}>`,
          inline: false
        },
        {
          name: "📁 Kategori & Kanallar",
          value:
            `• Kategori: ${category.name}\n` +
            `• Kayıt: <#${kayıtKanal.id}>\n` +
            `• Teyit: ${voiceChannels.map(vc => `<#${vc.id}>`).join(" ")}`,
          inline: true
        },
        {
          name: "🔒 Görünürlük",
          value: `**Kayıtsız** rolü artık **KAYIT** kategorisi dışındaki hiçbir kanalı göremez (${restricted.length} kanal kısıtlandı).`,
          inline: false
        }
      )
      .setFooter({ text: "Komutu tekrar kullanmak oluşturulan rol/kanalları siler." })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Kayıt sistemi kurulurken hata:", error);
    return interaction.editReply({
      content: "Kayıt sistemi kurulurken bir hata oluştu. Botun `Rolleri Yönet` ve `Kanalları Yönet` yetkilerine sahip olduğundan emin ol."
    });
  }
}

// ---------------- KALDIRMA ----------------
async function teardown(interaction, record) {
  const guild = interaction.guild;
  const guildId = guild.id;

  // 1) İzin kısıtlamalarını geri al
  for (const id of record.restricted || []) {
    const channel = guild.channels.cache.get(id);
    if (!channel) continue;
    try {
      await channel.permissionOverwrites.edit(record.kayitsizRoleId, { ViewChannel: null });
    } catch {}
  }

  // 2) Oluşturulan kanalları sil (kategori en son silinecek şekilde ters sırada)
  for (const id of [...(record.createdChannels || [])].reverse()) {
    const channel = guild.channels.cache.get(id);
    if (!channel) continue;
    try {
      await channel.delete("Kayıt sistemi kaldırıldı");
    } catch {}
  }

  // 3) Oluşturulan rolleri sil
  for (const id of record.createdRoles || []) {
    const role = guild.roles.cache.get(id);
    if (!role) continue;
    try {
      await role.delete("Kayıt sistemi kaldırıldı");
    } catch {}
  }

  // 4) Veritabanını temizle
  for (const key of REGISTER_KEYS(guildId)) db.delete(key);
  db.delete(RECORD_KEY(guildId));

  const embed = new EmbedBuilder()
    .setColor("#E74C3C")
    .setTitle("Kayıt Sistemi Kaldırıldı")
    .setDescription("Kayıt sistemi tarafından oluşturulan roller, kanallar ve izin kısıtlamaları silindi. Komutu tekrar çalıştırarak yeniden kurabilirsin.")
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}
