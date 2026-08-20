const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const db = require("croxydb");
const register = require("./register-system");

const hasPanelPerm = (member) =>
  member.permissions.has(PermissionsBitField.Flags.Administrator) ||
  (member.permissions.has(PermissionsBitField.Flags.ManageRoles) &&
    member.permissions.has(PermissionsBitField.Flags.ManageChannels));

const hasWelcomePerm = (interaction) =>
  hasPanelPerm(interaction.member) ||
  (!!db.get(`kayityetkili_${interaction.guild.id}`) &&
    interaction.member.roles.cache.has(db.get(`kayityetkili_${interaction.guild.id}`)));

const GIF_INPUT = "kayit_gif_url";
const NAME_INPUT = "kayit_name_input";

// Karşılama butonlarından gelen kayıt: tıklayan yetkili ismi girer, rol otomatik atanır
async function welcomeRegister(interaction, member, cinsiyet) {
  const guild = interaction.guild;
  const rol = db.get(`${cinsiyet}_${guild.id}`);
  const kayıtsız = db.get(`otorol_${guild.id}`);
  const kayıtkanal = db.get(`kayitkanal_${guild.id}`);
  const kayıtgif = db.get(`kayıtgif_${guild.id}`);

  const types = register.getTypes(guild.id);
  if (types[cinsiyet] === false) throw new Error("Bu kayıt türü kapalı!");
  if (!rol && cinsiyet !== "üye") {
    throw new Error(cinsiyet === "kadın" ? "Kız rolü ayarlanmamış!" : "Erkek rolü ayarlanmamış!");
  }
  if (!kayıtsız) throw new Error("Kayıtsız rolü ayarlanmamış!");

  const isim = interaction.fields.getTextInputValue(NAME_INPUT);
  if (!isim.trim().match(/^[a-zA-ZÇĞİÖŞÜçğıöşü]{2,}$/)) throw new Error("Geçerli bir isim girmelisin!");
  const setName = isim.trim()[0].toUpperCase() + isim.trim().slice(1).toLowerCase();

  await member.setNickname(setName).catch(() => {});
  if (cinsiyet !== "üye" && rol) await member.roles.add(rol).catch(() => {});
  await member.roles.remove(kayıtsız).catch(() => {});

  const stat = db.get(`kayitstat_${guild.id}`) || { erkek: 0, kadın: 0, üye: 0, toplam: 0 };
  if (cinsiyet === "kadın") stat.kadın++;
  else if (cinsiyet === "üye") stat.üye++;
  else stat.erkek++;
  stat.toplam++;
  db.set(`kayitstat_${guild.id}`, stat);

  const sonsuz = await register.findWelcomeEmoji(guild, "infinity");

  const embed = new EmbedBuilder()
    .setColor("Random")
    .setThumbnail(
      cinsiyet === "kadın"
        ? "https://cdn.discordapp.com/attachments/1188118049887367168/1242067305362358302/Custom-Icon-Design-Flatastic-7-Female.512.png?ex=664c7cd2&is=664b2b52&hm=0bf5486b1664455a5b285ca35804458763bd0b92b89d255b19c3d39b45589114&"
        : cinsiyet === "üye"
          ? "https://cdn.discordapp.com/attachments/1188118049887367168/1251222509811007568.webp?size=96&quality=lossless"
          : "https://cdn.discordapp.com/attachments/1188118049887367168/1242065418621947975/male-symbol-blue-icon.png?ex=664c7b10&is=664b2990&hm=305860cea743814cda8dd232942cece77d54d5bd4008b21fef90bce43b77a98a&"
    )
    .setDescription(
      `${sonsuz} ‍ **${guild.name}** ‍ ${sonsuz}\n\n` +
      `• Kayıt edilen **kullanıcı**: <@${member.user.id}>\n` +
      `• Kayıt işleminde **verilen isim**: ${setName}\n` +
      `• Kayıt işleminde **alınan rol**: <@&${kayıtsız}>` +
      (cinsiyet !== "üye" && rol ? `\n• Kayıt işleminde **verilen rol**: <@&${rol}>` : "")
    )
    .setFooter({ text: `Teyit eden : ${interaction.user.tag}` })
    .setTimestamp();
  if (kayıtgif) embed.setImage(kayıtgif);

  if (kayıtkanal) guild.channels.cache.get(kayıtkanal)?.send({ embeds: [embed] }).catch(() => {});

  return { message: `✅ <@${member.user.id}> **${setName}** olarak kaydedildi.` };
}

module.exports = (client) => {
  client.on("interactionCreate", async (interaction) => {
    const { customId } = interaction;

    try {
      // ---------------- Hoşgeldin kayıt butonları ----------------
      if (interaction.isButton() && (customId.startsWith("kayit_wlc_erkek_") || customId.startsWith("kayit_wlc_kadin_") || customId.startsWith("kayit_wlc_uye_"))) {
        if (!hasWelcomePerm(interaction)) {
          return interaction.reply({ content: "Bu işlem için yetkin yok! Sadece kayıt yetkilileri kayıt yapabilir.", ephemeral: true });
        }
        const cinsiyet = customId.startsWith("kayit_wlc_kadin_") ? "kadın" : customId.startsWith("kayit_wlc_uye_") ? "üye" : "erkek";
        const targetId = customId.slice(`kayit_wlc_${cinsiyet}_`.length);
        const member = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!member) return interaction.reply({ content: "Kayıt edilecek üye bulunamadı.", ephemeral: true });

        const types = register.getTypes(interaction.guild.id);
        if (types[cinsiyet] === false) return interaction.reply({ content: "Bu kayıt türü şu an kapalı!", ephemeral: true });
        if (cinsiyet !== "üye") {
          const rolVar = db.get(`${cinsiyet}_${interaction.guild.id}`);
          if (!rolVar) return interaction.reply({ content: "Bu kayıt türü henüz ayarlanmamış, yetkilileri bekleyin!", ephemeral: true });
        }
        const kayitRolleri = [db.get(`erkek_${interaction.guild.id}`), db.get(`kadın_${interaction.guild.id}`), db.get(`üye_${interaction.guild.id}`)];
        if (kayitRolleri.some((r) => r && member.roles.cache.has(r))) {
          return interaction.reply({ content: `<@${targetId}> zaten kayıtlı!`, ephemeral: true });
        }
        return interaction.showModal(register.welcomeNameModal(cinsiyet, targetId));
      }

      // ---------------- Hoşgeldin At/Yasakla butonları ----------------
      if (interaction.isButton() && (customId.startsWith("kayit_wlc_at_") || customId.startsWith("kayit_wlc_yasakla_"))) {
        if (!hasWelcomePerm(interaction)) {
          return interaction.reply({ content: "Bu işlem için yetkin yok! Sadece kayıt yetkilileri bu işlemi yapabilir.", ephemeral: true });
        }
        const isBan = customId.startsWith("kayit_wlc_yasakla_");
        const targetId = customId.slice(isBan ? "kayit_wlc_yasakla_".length : "kayit_wlc_at_".length);
        const member = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!member) return interaction.reply({ content: "İşlem yapılacak üye bulunamadı.", ephemeral: true });

        try {
          if (isBan) {
            await member.ban({ reason: `${interaction.user.tag} tarafından karşılama butonu ile yasaklandı.` });
            return interaction.reply({ content: `🔨 <@${targetId}> sunucudan **yasaklandı**.`, ephemeral: true });
          }
          await member.kick(`${interaction.user.tag} tarafından karşılama butonu ile atıldı.`);
          return interaction.reply({ content: `⚔️ <@${targetId}> sunucudan **atıldı**.`, ephemeral: true });
        } catch (e) {
          return interaction.reply({ content: "❗ İşlem sırasında hata oluştu: " + e.message, ephemeral: true });
        }
      }

      // ---------------- Hoşgeldin kayıt modal ----------------
      if (interaction.isModalSubmit() && customId.startsWith("kayit_wlc_modal_")) {
        const rest = customId.slice("kayit_wlc_modal_".length);
        const [cinsiyet, targetId] = rest.split("_");
        if ((cinsiyet !== "erkek" && cinsiyet !== "kadın" && cinsiyet !== "üye") || !targetId) return;
        const member = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!member) return interaction.reply({ content: "Kayıt edilecek üye bulunamadı.", ephemeral: true });
        try {
          const res = await welcomeRegister(interaction, member, cinsiyet);
          return interaction.reply({ content: res.message, ephemeral: true });
        } catch (e) {
          return interaction.reply({ content: "❌ " + e.message, ephemeral: true });
        }
      }

      // ---------------- Rol seçici ----------------
      if (interaction.isRoleSelectMenu() && customId.startsWith("kayit_sel_")) {
        const field = customId.slice("kayit_sel_".length);
        if (!register.roleFields[field]) return;
        if (!hasPanelPerm(interaction.member)) {
          return interaction.reply({ content: "Bunun için yeterli yetkin yok!", ephemeral: true });
        }

        const roleId = interaction.values[0];
        db.set(`${register.roleFields[field]}_${interaction.guild.id}`, roleId);

        await interaction.deferUpdate();
        if (register.isInstalled(interaction.guild.id)) {
          await register.syncPermissions(interaction.guild).catch(() => {});
        }
        await interaction.editReply(register.renderPage(interaction.guild));
        return interaction.followUp({
          content: `✅ **${register.roleLabels[field]}** ayarlandı → <@&${roleId}>\n${register.isInstalled(interaction.guild.id) ? "Kanal izinleri bu role göre güncellendi." : ""}`,
          ephemeral: true
        });
      }

      // ---------------- Kanal seçici ----------------
      if (interaction.isChannelSelectMenu() && customId === "kayit_sel_kayitkanal") {
        if (!hasPanelPerm(interaction.member)) {
          return interaction.reply({ content: "Bunun için yeterli yetkin yok!", ephemeral: true });
        }

        const channelId = interaction.values[0];
        db.set(`kayitkanal_${interaction.guild.id}`, channelId);

        await interaction.deferUpdate();
        if (register.isInstalled(interaction.guild.id)) {
          await register.syncPermissions(interaction.guild).catch(() => {});
        }
        await interaction.editReply(register.renderPage(interaction.guild));
        return interaction.followUp({
          content: `✅ **Kayıt Kanalı** ayarlandı → <#${channelId}>\n${register.isInstalled(interaction.guild.id) ? "Yeni kanala kayıt sistemi izinleri uygulandı." : ""}`,
          ephemeral: true
        });
      }

      // ---------------- Gif modalı ----------------
      if (interaction.isModalSubmit() && customId === "kayit_gif_modal") {
        if (!hasPanelPerm(interaction.member)) {
          return interaction.reply({ content: "Bunun için yeterli yetkin yok!", ephemeral: true });
        }

        const url = interaction.fields.getTextInputValue(GIF_INPUT);
        if (!/^https?:/i.test(url)) {
          return interaction.reply({ content: "Geçerli bir **link** girmelisin (https ile başlayan).", ephemeral: true });
        }

        db.set(`kayıtgif_${interaction.guild.id}`, url);
        await interaction.reply({ content: `✅ **Kayıt Gif** ayarlandı → [Link](${url})`, ephemeral: true });
        await register.refreshPanel(interaction.guild);
        return;
      }

      // ---------------- Butonlar ----------------
      if (!interaction.isButton() || !customId.startsWith("kayit_btn_")) return;
      if (!hasPanelPerm(interaction.member)) {
        return interaction.reply({ content: "Bunun için yeterli yetkin yok!", ephemeral: true });
      }

      const BTN = register.BTN;
      const guild = interaction.guild;

      // Seçici açan butonlar (altlarında Geri Dön butonu bulunur)
      if (customId === BTN.erkek) return interaction.update({ embeds: [register.buildPanelEmbed(guild)], components: register.selectStageRows(register.roleSelectRow("erkek")) });
      if (customId === BTN.kadin) return interaction.update({ embeds: [register.buildPanelEmbed(guild)], components: register.selectStageRows(register.roleSelectRow("kadin")) });
      if (customId === BTN.uye) return interaction.update({ embeds: [register.buildPanelEmbed(guild)], components: register.selectStageRows(register.roleSelectRow("uye")) });
      if (customId === BTN.otorol) return interaction.update({ embeds: [register.buildPanelEmbed(guild)], components: register.selectStageRows(register.roleSelectRow("otorol")) });
      if (customId === BTN.yetkili) return interaction.update({ embeds: [register.buildPanelEmbed(guild)], components: register.selectStageRows(register.roleSelectRow("yetkili")) });
      if (customId === BTN.kanal) return interaction.update({ embeds: [register.buildPanelEmbed(guild)], components: register.selectStageRows(register.channelSelectRow()) });
      if (customId === BTN.gif) return interaction.showModal(register.gifModal());

      // Seçici ekranından geri dönme
      if (customId === BTN.cancel) {
        return interaction.update(register.renderPage(guild));
      }

      // Eylem butonları (uzun sürebilir, önce deff
      await interaction.deferUpdate();

      if (customId === BTN.ileri) {
        register.setPage(guild.id, register.PAGES.ALTYAPI);
        await interaction.editReply(register.renderPage(guild, register.PAGES.ALTYAPI));
        return interaction.followUp({ content: "📄 **Kurulum** sayfasına geçildi.", ephemeral: true });
      }

      if (customId === BTN.geri) {
        register.setPage(guild.id, register.PAGES.AYARLAR);
        await interaction.editReply(register.renderPage(guild, register.PAGES.AYARLAR));
        return interaction.followUp({ content: "📄 **Ayarlar** sayfasına geçildi.", ephemeral: true });
      }

      if (customId === BTN.kur) {
        if (register.isInstalled(guild.id)) {
          return interaction.followUp({ content: "Sistem **zaten kurulu**. Önce **Kaldır** butonuyla kaldırıp yeniden kurabilirsin.", ephemeral: true });
        }
        try {
          const res = await register.runSetup(guild);
          const types = register.getTypes(guild.id);
          const rolSatir = [
            types.erkek ? `**Erkek:** <@&${res.erkek}>` : null,
            types.kadın ? `**Kadın:** <@&${res.kadın}>` : null,
            types.üye ? `**Üye:** <@&${res.üye}>` : null
          ].filter(Boolean).join(" • ");
          const embed = new EmbedBuilder()
            .setColor("#2ECC71")
            .setTitle("✅ Kayıt Sistemi Kuruldu")
            .setDescription(
              `**Kayıtsız:** <@&${res.kayitsiz}> • **Yetkili:** <@&${res.yetkili}>\n` +
              `${rolSatir}\n\n` +
              `**Kategori:** ${res.kategori.name} • **Kayıt:** <#${res.kanal.id}> • **Teyit:** ${res.teyit.map(vc => `<#${vc.id}>`).join(" ")}\n\n` +
              `🔒 **Kayıtsız** rolü ${res.restrictedCount} kanaldan gizlendi (sadece kayıt kategorisini görebilir).`
            )
            .setFooter({ text: res.createdRoleCount || res.createdChannelCount ? "Yeni oluşturulan roller/kanallar Kaldır ile temizlenir." : "Mevcut roller/kanallar kullanıldı." })
            .setTimestamp();
          await interaction.editReply(register.renderPage(guild));
          return interaction.followUp({ embeds: [embed], ephemeral: true });
        } catch (error) {
          console.error("Kayıt sistemi kurulurken hata:", error);
          return interaction.followUp({ content: "Kurulum sırasında hata oluştu! Botun **Rolleri Yönet** ve **Kanalları Yönet** yetkilerine sahip olduğundan emin ol.", ephemeral: true });
        }
      }

      if (customId === BTN.kaldir) {
        if (!register.isInstalled(guild.id)) {
          return interaction.followUp({ content: "Kurulu bir sistem yok. Önce **Kur** butonuyla kurmalısın.", ephemeral: true });
        }
        try {
          const res = await register.runTeardown(guild);
          let desc = `Sistem için kullanılan **${res.rol}** rol ve **${res.kanal}** kanal silindi, **${res.kısıt}** kanaldaki görünürlük kısıtlaması geri alındı.`;
          if (res.errors && res.errors.length) {
            desc += "\n\n⚠️ **Silinemeyenler:**\n" + res.errors.slice(0, 8).map(x => "• " + x).join("\n") + (res.errors.length > 8 ? `\n+${res.errors.length - 8} hata daha` : "");
          }
          const embed = new EmbedBuilder()
            .setColor("#E74C3C")
            .setTitle("❌ Kayıt Sistemi Kaldırıldı")
            .setDescription(desc)
            .setTimestamp();
          await interaction.editReply(register.renderPage(guild));
          return interaction.followUp({ embeds: [embed], ephemeral: true });
        } catch (error) {
          console.error("Kayıt sistemi kaldırılırken hata:", error);
          return interaction.followUp({ content: "Kaldırma sırasında hata oluştu!", ephemeral: true });
        }
      }

      if (customId === BTN.sifirla) {
        let res = null;
        if (register.isInstalled(guild.id)) {
          res = await register.runTeardown(guild).catch(() => null);
        }
        for (const key of register.REGISTER_KEYS(guild.id)) db.delete(key);
        db.delete(register.RECORD_KEY(guild.id));
        db.delete(`kayitstat_${guild.id}`);
        await interaction.editReply(register.renderPage(guild));
        const uyarı = res && res.errors && res.errors.length ? ` ⚠️ ${res.errors.length} öğe silinemedi.` : "";
        return interaction.followUp({ content: `🧹 Kayıt sistemi tamamen sıfırlandı.${uyarı}`, ephemeral: true });
      }

      if (customId === BTN.yenile) {
        await interaction.editReply(register.renderPage(guild));
        return interaction.followUp({ content: "🔄 Panel güncellendi.", ephemeral: true });
      }
    } catch (error) {
      console.error("Kayıt paneli hatası:", error);
      if (interaction.deferred || interaction.replied) {
        return interaction.followUp({ content: "Bir hata oluştu!", ephemeral: true });
      }
      return interaction.reply({ content: "Bir hata oluştu!", ephemeral: true });
    }
  });
};