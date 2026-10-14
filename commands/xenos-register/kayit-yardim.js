const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  name: "kayıt-yardım",
  description: "Web paneli üzerinden nasıl kayıt olabileceğiniz hakkında bilgi verir.",
  type: 1,
  options: [],

  run: async (client, interaction) => {
    const embed = new EmbedBuilder()
      .setTitle("🌐 Web Panel Kayıt Sistemi")
      .setDescription(
        "Sunucumuza kayıt olmak için artık web panelimizi kullanabilirsiniz!\n\n" +
        "**Nasıl Kayıt Olurum?**\n" +
        "**1.** Aşağıdaki butona tıklayarak web panelimize gidin.\n" +
        "**2.** Paneldeki **'Discord ile Giriş Yap'** butonuna tıklayın.\n" +
        "**3.** Açılan Discord yetkilendirme ekranında *(tarayıcınızda hesabınız açık değilse giriş yapmanız istenebilir)* yetkiyi onaylayın.\n\n" +
        "✅ İşlem tamamlandığında kaydınız otomatik olarak onaylanacaktır!"
      )
      .setColor("Blue")
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .setFooter({ text: "Gelişmiş Web Panel Kayıt Sistemi" })
      .setTimestamp();

    const button = new ButtonBuilder()
      .setLabel("Kayıt Paneline Git")
      .setURL("http://localhost:3000/") // Burayı kendi web sitenizin URL'si ile değiştirebilirsiniz
      .setStyle(ButtonStyle.Link);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({ embeds: [embed], components: [row] });
  }
};
