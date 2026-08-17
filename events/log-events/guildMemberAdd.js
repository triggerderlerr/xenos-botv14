const {
  Client,
  GatewayIntentBits,
  Partials,
  AuditLogEvent,
  PermissionsBitField,
  EmbedBuilder
} = require("discord.js");

const INTENTS = Object.values(GatewayIntentBits);
const PARTIALS = Object.values(Partials);
const db = require("croxydb");
const moment = require('moment');
const config = require('../../utils/constants/config.json');
const messages = require('../../utils/constants/messages');
const embedBuilder = require('../../utils/helpers/embeds');

//======================= KAYIT SİSTEMİ =============================

module.exports = async (client, member, reason) => {
  const kayıtknl = db.get(`kayitkanal_${member.guild.id}`);

  // Stats sistemi açıksa kanal sayılarını güncelle
  if (db.get(`statsdurum_${member.guild.id}`) === 'açık') {
    const toplam = db.get(`statkanal1_${member.guild.id}`) || "";
    const uye = db.get(`statkanal2_${member.guild.id}`) || "";
    const bot = db.get(`statkanal3_${member.guild.id}`) || "";

    if (toplam) member.guild.channels.cache.get(toplam)?.setName(`💜 Toplam ${member.guild.memberCount}`).catch(() => {});
    if (uye) member.guild.channels.cache.get(uye)?.setName(`💜 Üye ${member.guild.members.cache.filter((m) => !m.user.bot).size}`).catch(() => {});
    if (bot) member.guild.channels.cache.get(bot)?.setName(`🤖 Bot - ${member.guild.members.cache.filter(m => m.user.bot).size}`).catch(() => {});
  }

  if (kayıtknl) {
    const kayıtsızrol = db.get(`otorol_${member.guild.id}`);
    const kayıtkanal = db.get(`kayitkanal_${member.guild.id}`);
    const kayıtgif = db.get(`kayıtgif_${member.guild.id}`);

    // Kayıtsız rolünü ver - nickname/gif hataları rolü asla engellemesin
    if (kayıtsızrol && !member.roles.cache.has(kayıtsızrol)) {
      member.roles.add(kayıtsızrol).catch(() => {});
    }

    try {
      await member.setNickname("Isim | Yaş").catch(() => {});
    } catch {}

    if (!kayıtkanal) return;

    const avatar = client.user.displayAvatarURL({ dynamic: true });
    const username = client.user.username;

    const rightarrow = member.guild.emojis.cache.find(emoji => emoji.name === config.rightarrow);
    const verify = member.guild.emojis.cache.find(emoji => emoji.name === config.verify);

    const kurulus = Date.now() - member.user.createdTimestamp;
    const ayyy = moment.duration(kurulus).format("M");
    let kontrol = ayyy < 1 ? `   \Şüpheli ❌\ ` : `   \Güvenilir ✅\ `;

    const embed = new EmbedBuilder()
      .setColor("Random")
      .setAuthor({ name: `${username}`, iconURL: `${avatar}`, url: 'https://discord.gg/zGwFVQkX' })
      .setDescription(`<@${member.user.id}>, Aramıza **Hoşgeldin!**\n\n• Seninle Beraber **${member.guild.memberCount}** Kişiyiz.\n• Kayıt Olmak Için **Ses Teyit** Odalarından Birine Geçip Bekleyiniz.\n• Kayıt Tarihi: **${moment.utc(member.user.createdAt).format('DD.MM.YY')}**\n• Bu Hesap **${kontrol}**\n• **Bol keyifli zaman geçirmeniz dileğiyle..**`, true)
      .setTimestamp();
    if (kayıtgif) embed.setImage(`${kayıtgif}`);

    member.guild.channels.cache.get(kayıtkanal)?.send({ embeds: [embed] }).catch(() => {});
  }

  //==================== JOIN LOG ============================

  // Log durumu kapalıysa kontrol yapma
  if (db.get(`logdurum_${member.guild.id}`) === 'açık') {
    const logchannel = db.get(`logchannels_${member.guild.id}`);
    const kanal = member.guild.channels.cache.get(logchannel);
    if (kanal) {
      await kanal.send({
        embeds: [embedBuilder.guildMA(client, member, reason)],
      });
    }
  }

  //============================================================
};
