const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const db = require("croxydb");
const messages = require('../../utils/constants/messages');
const links = require("../../utils/constants/adlinks.json");
const badwords = require("../../utils/constants/badwords.json");

module.exports = async (client, message) => {
  if (!message.guild || message.author.bot) return;

  const guildId = message.guild.id;
  const isAdmin = message.member?.permissions?.has(PermissionsBitField.Flags.Administrator);
  const isOwner = message.guild.ownerId === message.author.id;

  const reklamlar = db.get(`reklamengel_${guildId}`);
  const kufur = db.get(`kufurengel_${guildId}`);
  const antispam = db.get(`antispam_${guildId}`);

  // Üç sistem de kapalıysa hiçbir kontrol yapma
  if (reklamlar !== 'açık' && kufur !== 'açık' && antispam !== 'açık') return;

  const guildIconURL = message.guild.iconURL({ dynamic: true, size: 512 }) || message.guild.bannerURL({ dynamic: true, size: 512 });

  if (reklamlar === "açık") {
    const linkler = links.linkler;
    const contentLowerCase = message.content.toLowerCase();

    if (linkler.some((link) => contentLowerCase.includes(link.toLowerCase()))) {
      if (!isAdmin && !isOwner) {
        await message.delete();
        const sentMessage = await message.channel.send(
          `<@${message.author.id}>, Bu sunucuda reklam yapmak yasak!`
        );
        setTimeout(() => sentMessage.delete(), 5000);

        const logChannelAntiReklamId = db.get(`logchannelantireklam_${guildId}`);
        if (logChannelAntiReklamId) {
          const logChannelAntiReklam = message.guild.channels.cache.get(logChannelAntiReklamId);
          if (logChannelAntiReklam) {
            const embed = new EmbedBuilder()
              .setColor('#FF5733')
              .setTitle("Reklam Engellendi")
              .setDescription(`**Gönderen:** <@${message.author.id}>`)
              .setThumbnail(guildIconURL)
              .setFooter({ text: `Sunucu: ${message.guild.name}`, iconURL: guildIconURL })
              .setTimestamp()
              .setAuthor({ name: message.guild.name, iconURL: guildIconURL })
              .addFields(
                { name: "Mesajın İçeriği", value: `\`\`\`${message.content}\`\`\``, inline: false },
                { name: "Kullanıcı ID'si", value: `${message.author.id}`, inline: true },
                { name: "Mesajın Oluşturulma Zamanı", value: `<t:${Math.floor(message.createdTimestamp / 1000)}:F>`, inline: true }
              );

            logChannelAntiReklam.send({ embeds: [embed] });
          }
        }
      }
    }
  }

  if (kufur === "açık") {
    const kufurler = badwords.kufurler;

    if (kufurler.some((badword) => new RegExp(`\\b${badword}\\b`, 'i').test(message.content))) {
      if (!isAdmin && !isOwner) {
        await message.delete();
        const sentMessage = await message.channel.send(
          `<@${message.author.id}>, Bu sunucuda küfür etmek yasak!`
        );
        setTimeout(() => sentMessage.delete(), 5000);

        const logChannelAntiBadWordId = db.get(`logchannelantibadword_${guildId}`);
        if (logChannelAntiBadWordId) {
          const logChannelAntiBadWord = message.guild.channels.cache.get(logChannelAntiBadWordId);
          if (logChannelAntiBadWord) {
            const embed = new EmbedBuilder()
              .setColor('#FF5733')
              .setTitle("Küfür Engellendi")
              .setDescription(`**Gönderen:** <@${message.author.id}>`)
              .setThumbnail(guildIconURL)
              .setFooter({ text: `Sunucu: ${message.guild.name}`, iconURL: guildIconURL })
              .setTimestamp()
              .setAuthor({ name: message.guild.name, iconURL: guildIconURL })
              .addFields(
                { name: "Mesajın İçeriği", value: `\`\`\`${message.content}\`\`\``, inline: false },
                { name: "Kullanıcı ID'si", value: `${message.author.id}`, inline: true },
                { name: "Mesajın Oluşturulma Zamanı", value: `<t:${Math.floor(message.createdTimestamp / 1000)}:F>`, inline: true }
              );

            logChannelAntiBadWord.send({ embeds: [embed] });
          }
        }
      }
    }
  }

  // Anti-spam kontrolü
  if (antispam === "açık") {
    const spamCooldown = 3000;
    let userMessages = db.get(`userMessages_${guildId}_${message.author.id}`) || [];

    userMessages = userMessages.filter(msg => Date.now() - msg < spamCooldown);

    if (userMessages.length >= 5 && !isAdmin && !isOwner) {
      await message.delete();
      const sentMessage = await message.channel.send(
        `<@${message.author.id}>, Bu sunucuda spam yapmak yasak!`
      );
      setTimeout(() => sentMessage.delete(), 5000);
    } else {
      userMessages.push(Date.now());
      db.set(`userMessages_${guildId}_${message.author.id}`, userMessages);
    }
  }
};
