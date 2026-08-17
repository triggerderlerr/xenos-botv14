const { PermissionsBitField } = require("discord.js");
const db = require("croxydb");

module.exports = {
  name: "kayıt-ayar",
  description: "Kayıt sisteminin tek bir ayarını sunucudaki rol/kanaldan seçerek değiştirir.",
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
      name: "rol",
      description: "Yeni rol (erkek/kadın/kayıtsız/yetkili alanlarında seçilir)",
      type: 8,
      required: false
    },
    {
      name: "kanal",
      description: "Yeni metin kanalı (kayıt kanalı alanında seçilir)",
      type: 7,
      required: false,
      channel_types: [0]
    },
    {
      name: "gif",
      description: "Gif linki (kayıt gif alanında girilir)",
      type: 3,
      required: false
    }
  ],
  run: async (client, interaction) => {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles) && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.reply({ content: "Rolleri Yönet veya Kanalları Yönet yetkine ihtiyaç var.", ephemeral: true });
    }

    const guild = interaction.guild;
    const field = interaction.options.getString("alan");

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

    const roleFields = ["erkek", "erkek2", "kadın", "kadın2", "kayitsiz-rol", "yetkili-rol"];

    // Rol alanları
    if (roleFields.includes(field)) {
      const role = interaction.options.getRole("rol");
      if (!role) {
        return interaction.reply({ content: "Bu alan için sunucudan bir **rol** seçmelisin.", ephemeral: true });
      }
      db.set(`${keyMap[field]}_${guild.id}`, role.id);
      return interaction.reply({ content: `✅ **${fieldLabel}** ayarlandı → <@&${role.id}>`, ephemeral: true });
    }

    // Kanal alanı
    if (field === "kayitkanal") {
      const channel = interaction.options.getChannel("kanal");
      if (!channel?.isTextBased()) {
        return interaction.reply({ content: "Bu alan için sunucudan bir **metin kanalı** seçmelisin.", ephemeral: true });
      }
      db.set(`kayitkanal_${guild.id}`, channel.id);
      return interaction.reply({ content: `✅ **${fieldLabel}** ayarlandı → <#${channel.id}>`, ephemeral: true });
    }

    // Gif alanı
    if (field === "gif") {
      const url = interaction.options.getString("gif");
      if (!url || !/^https?:/i.test(url)) {
        return interaction.reply({ content: "Bu alan için geçerli bir **link** girmelisin (https ile başlayan).", ephemeral: true });
      }
      db.set(`kayıtgif_${guild.id}`, url);
      return interaction.reply({ content: `✅ **${fieldLabel}** ayarlandı → [Link](${url})`, ephemeral: true });
    }
  }
};