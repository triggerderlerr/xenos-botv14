const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const db = require("croxydb");

module.exports = {
  name: "kayıt-ayar",
  description: "Kayıt sisteminin tek bir ayarını değiştirir.",
  type: 1,
  options: [
    {
      name: "alan",
      description: "Değiştirilecek ayar",
      type: 3,
      required: true,
      choices: [
        { name: "Erkek Rolü", value: "erkek" },
        { name: "Erkek-2 Rolü", value: "erkek2" },
        { name: "Kadın Rolü", value: "kadın" },
        { name: "Kadın-2 Rolü", value: "kadın2" },
        { name: "Kayıtsız Rolü", value: "kayitsiz-rol" },
        { name: "Kayıt Yetkilisi Rolü", value: "yetkili-rol" },
        { name: "Kayıt Kanalı", value: "kayitkanal" },
        { name: "Kayıt Gif", value: "gif" }
      ]
    },
    {
      name: "değer",
      description: "Yeni rol/kanal etiketi (veya gif için link)",
      type: 3,
      required: true
    }
  ],
  run: async (client, interaction) => {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles) && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.reply({ content: "Rolleri Yönet veya Kanalları Yönet yetkine ihtiyaç var.", ephemeral: true });
    }

    const guild = interaction.guild;
    const field = interaction.options.getString("alan");
    const value = interaction.options.getString("değer");

    const keyMap = {
      "erkek": "erkek",
      "erkek2": "erkek2",
      "kadın": "kadın",
      "kadın2": "kadın2",
      "kayitsiz-rol": "otorol",
      "yetkili-rol": "kayityetkili",
      "kayitkanal": "kayitkanal",
      "gif": "kayıtgif"
    };

    const fieldLabels = {
      "erkek": "Erkek Rolü",
      "erkek2": "Erkek-2 Rolü",
      "kadın": "Kadın Rolü",
      "kadın2": "Kadın-2 Rolü",
      "kayitsiz-rol": "Kayıtsız Rolü",
      "yetkili-rol": "Kayıt Yetkilisi Rolü",
      "kayitkanal": "Kayıt Kanalı",
      "gif": "Kayıt Gif"
    };
    const fieldLabel = fieldLabels[field];

    // Gif ayarı: URL olarak doğrudan kaydedilir
    if (field === "gif") {
      if (!/^https?:/i.test(value)) {
        return interaction.reply({ content: "Gif için geçerli bir link girmelisin (https ile başlayan).", ephemeral: true });
      }
      db.set(`kayıtgif_${guild.id}`, value);
      return interaction.reply({ content: `✅ **${fieldLabel}** ayarlandı → [Link](${value})`, ephemeral: true });
    }

    // Rol / kanal ayarları: etiket veya ID çözümlenir
    const idMatch = value.match(/\d{17,20}/);
    if (!idMatch) {
      return interaction.reply({ content: "Geçerli bir rol veya kanal etiketi/ID'si girmelisin.", ephemeral: true });
    }
    const targetId = idMatch[0];

    if (field === "kayitkanal") {
      const channel = guild.channels.cache.get(targetId);
      if (!channel?.isTextBased()) {
        return interaction.reply({ content: "Bu ID'ye ait geçerli bir metin kanalı bulamadım.", ephemeral: true });
      }
      db.set(`kayitkanal_${guild.id}`, channel.id);
      return interaction.reply({ content: `✅ **${fieldLabel}** ayarlandı → <#${channel.id}>`, ephemeral: true });
    }

    const role = guild.roles.cache.get(targetId);
    if (!role) {
      return interaction.reply({ content: "Bu ID'ye ait bir rol bulamadım.", ephemeral: true });
    }

    db.set(`${keyMap[field]}_${guild.id}`, role.id);
    return interaction.reply({ content: `✅ **${fieldLabel}** ayarlandı → <@&${role.id}>`, ephemeral: true });
  }
};