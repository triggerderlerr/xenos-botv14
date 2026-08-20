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
const messages = require('../../utils/constants/messages');
const embedBuilder = require('../../utils/helpers/embeds');
const register = require('../../utils/register-system');

//======================= KAYIT SİSTEMİ =============================

module.exports = async (client, member, reason) => {
  const kayıtknl = db.get(`kayitkanal_${member.guild.id}`);

  // Stats sistemi açıksa kanal sayılarını güncelle
  if (db.get(`statsdurum_${member.guild.id}`) === 'açık') {
    const toplam = db.get(`statkanal1_${member.guild.id}`) || "";
    const uye = db.get(`statkanal2_${member.guild.id}`) || "";
    const bot = db.get(`statkanal3_${member.guild.id}`) || "";

    if (toplam) member.guild.channels.cache.get(toplam)?.setName(`💜 Toplam ${member.guild.memberCount}`).catch(() => {});
    if (uye) member.guild.channels.cache.get(uye)?.setName(`💜 Üye ${member.guild.members.cache.filter((m) => m.user && !m.user.bot).size}`).catch(() => {});
    if (bot) member.guild.channels.cache.get(bot)?.setName(`🤖 Bot - ${member.guild.members.cache.filter(m => m.user && m.user.bot).size}`).catch(() => {});
  }

  if (kayıtknl) {
    const kayıtsızrol = db.get(`otorol_${member.guild.id}`);
    const kayıtkanal = db.get(`kayitkanal_${member.guild.id}`);
    const kayıtgif = db.get(`kayıtgif_${member.guild.id}`);
    const nickAktif = db.get(`nickAktif_${member.guild.id}`) !== false;
    const nickSablon = db.get(`nickSablon_${member.guild.id}`) || "Isim | Yaş";

    // Kayıtsız rolünü ver - nickname/gif hataları rolü asla engellemesin
    if (kayıtsızrol && !member.roles.cache.has(kayıtsızrol)) {
      member.roles.add(kayıtsızrol).catch(() => {});
    }

    // Otomatik isim verme açıksa şablona göre nickname ver (yer tutucular: {username}, {tag})
    if (nickAktif) {
      const nick = nickSablon
        .split("{username}").join(member.user.username)
        .split("{tag}").join(member.user.tag);
      try {
        await member.setNickname(nick).catch(() => {});
      } catch {}
    }

    if (!kayıtkanal) return;

    const avatar = client.user.displayAvatarURL({ dynamic: true });
    const username = client.user.username;

    const rightarrow = await register.findWelcomeEmoji(member.guild, "arrow");
    const verify = await register.findWelcomeEmoji(member.guild, "verify");

    const kurulus = Date.now() - member.user.createdTimestamp;
    const ayyy = moment.duration(kurulus).format("M");
    let kontrol = ayyy < 1 ? `Şüpheli ❌` : `Güvenilir ✅`;

    // Karşılama mesajı şablonu (web panelinden düzenlenebilir)
    const karsilama = db.get(`karsilama_${member.guild.id}`) || {};
    const T = (s) => String(s || "")
      .split("{member}").join(`<@${member.user.id}>`)
      .split("{username}").join(member.user.username)
      .split("{tag}").join(member.user.tag)
      .split("{sunucu}").join(member.guild.name)
      .split("{sayi}").join(member.guild.memberCount)
      .split("{tarih}").join(moment.utc(member.user.createdAt).format('DD.MM.YY'))
      .split("{kontrol}").join(kontrol);

    const defaultDesc =
      "Merhaba {member}, Sunucuya **Hoşgeldin!**\n\n" +
      "• Seninle Beraber **{sayi}** Kişiyiz.\n" +
      "• Kayıt Olmak Için **Ses Teyit** Odalarından Birine Geçip Bekleyiniz.\n" +
      "• Kayıt Tarihi: **{tarih}**\n" +
      "• Bu Hesap **{kontrol}**\n" +
      "• **Bol keyifli zaman geçirmeniz dileğiyle..**";

    const embed = new EmbedBuilder()
      .setColor("Random")
      .setAuthor({ name: `${username}`, iconURL: `${avatar}`, url: 'https://discord.gg/zGwFVQkX' })
      .setDescription(karsilama.mesaj ? T(karsilama.mesaj) : T(defaultDesc))
      .setTimestamp();
    if (karsilama.baslik) embed.setTitle(T(karsilama.baslik));
    if (karsilama.footer) embed.setFooter({ text: T(karsilama.footer) });
    if (kayıtgif) embed.setImage(`${kayıtgif}`);

    member.guild.channels.cache.get(kayıtkanal)?.send({ embeds: [embed], components: [register.welcomeButtons(member.id, member.guild.id)] }).catch(() => {});
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
