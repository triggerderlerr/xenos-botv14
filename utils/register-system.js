const {
  PermissionsBitField, ChannelType, EmbedBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require("discord.js");
const db = require("croxydb");
const config = require("./constants/config.json");

const RECORD_KEY = (guildId) => `kayıtkur_${guildId}`;
const PANEL_KEY = (guildId) => `kayitpanel_${guildId}`;

const NAMES_KEY = (guildId) => `kayitadlar_${guildId}`;

const DEFAULT_NAMES = {
  kategori: "KAYIT",
  kayitkanal: "reg-chat",
  teyit: "Ses Teyit"
};

const getNames = (guildId) => {
  const stored = db.get(NAMES_KEY(guildId)) || {};
  return {
    kategori: stored.kategori || DEFAULT_NAMES.kategori,
    kayitkanal: stored.kayitkanal || DEFAULT_NAMES.kayitkanal,
    teyit: stored.teyit || DEFAULT_NAMES.teyit
  };
};

const setNames = (guildId, body) => {
  const current = getNames(guildId);
  const next = {
    kategori: body.kategori !== undefined ? String(body.kategori).slice(0, 32) : current.kategori,
    kayitkanal: body.kayitkanal !== undefined ? String(body.kayitkanal).slice(0, 32) : current.kayitkanal,
    teyit: body.teyit !== undefined ? String(body.teyit).slice(0, 32) : current.teyit
  };
  db.set(NAMES_KEY(guildId), next);
  return next;
};

const REGISTER_KEYS = (guildId) => [
  `erkek_${guildId}`,
  `kadın_${guildId}`,
  `üye_${guildId}`,
  `otorol_${guildId}`,
  `kayityetkili_${guildId}`,
  `kayitkanal_${guildId}`,
  `kayıtgif_${guildId}`,
  NAMES_KEY(guildId)
];

// Panel butonlarının customId değerleri (ASCII güvenli)
const BTN = {
  erkek: "kayit_btn_erkek",
  kadin: "kayit_btn_kadin",
  otorol: "kayit_btn_otorol",
  yetkili: "kayit_btn_yetkili",
  kanal: "kayit_btn_kanal",
  gif: "kayit_btn_gif",
  kur: "kayit_btn_kur",
  kaldir: "kayit_btn_kaldir",
  sifirla: "kayit_btn_sifirla",
  yenile: "kayit_btn_yenile",
  geri: "kayit_btn_geri",
  ileri: "kayit_btn_ileri",
  sayfa: "kayit_btn_sayfa",
  cancel: "kayit_btn_iptal"
};

const PAGES = {
  AYARLAR: 1,
  ALTYAPI: 2
};

// Rol seçici alanları: buton değeri -> db anahtarı
const roleFields = {
  erkek: "erkek",
  kadin: "kadın",
  otorol: "otorol",
  yetkili: "kayityetkili"
};

const roleLabels = {
  erkek: "Erkek Rolü",
  kadin: "Kadın Rolü",
  otorol: "Kayıtsız Rolü",
  yetkili: "Kayıt Yetkilisi"
};

const DISPLAY = [
  { key: "erkek", label: "🧍 Erkek Rolü" },
  { key: "kadın", label: "👩 Kadın Rolü" },
  { key: "otorol", label: "🚻 Kayıtsız Rolü" },
  { key: "kayityetkili", label: "🛡️ Kayıt Yetkilisi" },
  { key: "kayitkanal", label: "📝 Kayıt Kanalı" },
  { key: "kayıtgif", label: "🖼️ Kayıt Gif" }
];

const isInstalled = (guildId) => !!db.get(RECORD_KEY(guildId));

const getPage = (guildId) => {
  const ref = db.get(PANEL_KEY(guildId));
  return ref && ref.sayfa ? ref.sayfa : PAGES.AYARLAR;
};

const setPage = (guildId, page) => {
  const ref = db.get(PANEL_KEY(guildId));
  if (ref) {
    ref.sayfa = page;
    db.set(PANEL_KEY(guildId), ref);
  }
};

function valueLine(guild, key) {
  const value = db.get(`${key}_${guild.id}`);
  if (!value) return "`Ayarlanmamış ❌`";
  if (key === "kayitkanal") return `<#${value}>`;
  if (key === "kayıtgif") return `[Link](${value})`;
  const role = guild.roles.cache.get(value);
  return role ? `<@&${role.id}>` : "`Geçersiz ID ❌`";
}

function buildPanelEmbed(guild) {
  const settings = DISPLAY
    .map(s => `**${s.label}:** ${valueLine(guild, s.key)}`)
    .join("\n\n");

  const embed = new EmbedBuilder()
    .setColor("#9B59B6")
    .setTitle(`${guild.name} • Kayıt Sistemi Paneli`)
    .setDescription(
      `**Durum:** ${isInstalled(guild.id) ? "✅ **Kurulu**" : "❌ **Kurulu değil**"}\n\n${settings}`
    )
    .setFooter({
      text: isInstalled(guild.id)
        ? "Değişiklikler kayıt işlemine anında yansır • Kur'a basarak yeniden kurarsın"
        : "Önce bir rol/kanal seç, sonra Kur butonuyla sistemi devreye al"
    })
    .setTimestamp();

  return embed;
}

function buildAltyapiEmbed(guild) {
  const guildId = guild.id;
  const record = db.get(RECORD_KEY(guildId));

  let desc;
  if (!record) {
    desc =
      "❌ **Sistem henüz kurulmamış.**\n\n" +
      "Aşağıdaki **✅ Kur** butonuyla altyapıyı oluşturabilirsin. Kurulum öncesince `Ayarlar` sayfasındaki roller/kanal seçimleri dikkate alınır.";
  } else {
    const roleNames = (record.createdRoles || [])
      .map(id => guild.roles.cache.get(id)?.name)
      .filter(Boolean);
    const channelNames = (record.createdChannels || [])
      .map(id => guild.channels.cache.get(id)?.name)
      .filter(Boolean);

    desc =
      `**Durum:** ✅ **Kurulu**\n\n` +
      `🔒 **Kayıtsız rolü:** <@&${record.kayitsizRoleId}>\n` +
      `🛠 **Oluşturulan roller:** ${roleNames.length ? roleNames.map(n => `\`${n}\``).join(", ") : "Yeni rol oluşturulmadı (mevcutlar kullanıldı)"}\n` +
      `🧱 **Oluşturulan kanallar:** ${channelNames.length ? channelNames.map(n => `\`${n}\``).join(", ") : "Yeni kanal oluşturulmadı (mevcutlar kullanıldı)"}\n` +
      `🔇 **Gizlenen kanal:** ${record.restricted?.length || 0} adet`;
  }

  const stat = db.get(`kayitstat_${guildId}`) || {};
  if (stat.toplam) {
    desc += `\n\n📊 **Toplam kayıt:** ${stat.toplam} (👦 Erkek: ${stat.erkek || 0} • 👧 Kadın: ${stat.kadın || 0} • 👥 Üye: ${stat.üye || 0})`;
  } else {
    desc += `\n\n📊 Henüz kayıt yapılmadı.`;
  }

  return new EmbedBuilder()
    .setColor("#2ECC71")
    .setTitle(`${guild.name} • Kurulum Durumu`)
    .setDescription(desc)
    .setFooter({ text: "Kur ve Kaldır butonlarıyla altyapıyı yönetebilirsin." })
    .setTimestamp();
}

function buildPageEmbed(guild, page) {
  return page === PAGES.ALTYAPI ? buildAltyapiEmbed(guild) : buildPanelEmbed(guild);
}

function navRow(page) {
  const indicator = new ButtonBuilder()
    .setCustomId(BTN.sayfa)
    .setLabel(`Sayfa ${page}/${Object.keys(PAGES).length}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  if (page === PAGES.ALTYAPI) {
    return new ActionRowBuilder().addComponents(
      makeButton(BTN.geri, "Geri", ButtonStyle.Primary, "◀️"),
      indicator
    );
  }
  return new ActionRowBuilder().addComponents(
    indicator,
    makeButton(BTN.ileri, "İleri", ButtonStyle.Primary, "▶️")
  );
}

function pageRows(page) {
  if (page === PAGES.ALTYAPI) {
    const actions = new ActionRowBuilder().addComponents(
      makeButton(BTN.kur, "Kur", ButtonStyle.Success, "✅"),
      makeButton(BTN.kaldir, "Kaldır", ButtonStyle.Danger, "❌"),
      makeButton(BTN.sifirla, "Sıfırla", ButtonStyle.Danger, "🧹"),
      makeButton(BTN.yenile, "Yenile", ButtonStyle.Primary, "🔄")
    );
    return [actions, navRow(PAGES.ALTYAPI)];
  }
  return [...mainRows(), navRow(PAGES.AYARLAR)];
}

function renderPage(guild, page) {
  page = page || getPage(guild.id);
  return { embeds: [buildPageEmbed(guild, page)], components: pageRows(page) };
}

function makeButton(id, label, style, emoji) {
  return new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setEmoji(emoji);
}

function mainRows() {
  const row1 = new ActionRowBuilder().addComponents(
    makeButton(BTN.erkek, "Erkek", ButtonStyle.Primary, "🧍"),
    makeButton(BTN.kadin, "Kadın", ButtonStyle.Primary, "👩"),
    makeButton(BTN.otorol, "Kayıtsız", ButtonStyle.Secondary, "🚻"),
    makeButton(BTN.yetkili, "Yetkili", ButtonStyle.Secondary, "🛡️")
  );

  const row2 = new ActionRowBuilder().addComponents(
    makeButton(BTN.kanal, "Kanal", ButtonStyle.Secondary, "📝"),
    makeButton(BTN.gif, "Gif", ButtonStyle.Secondary, "🖼️"),
    makeButton(BTN.sayfa, "Sayfa", ButtonStyle.Secondary, "📄")
  );

  const row3 = new ActionRowBuilder().addComponents(
    makeButton(BTN.kur, "Kur", ButtonStyle.Success, "✅"),
    makeButton(BTN.kaldir, "Kaldır", ButtonStyle.Danger, "❌"),
    makeButton(BTN.sifirla, "Sıfırla", ButtonStyle.Danger, "🧹"),
    makeButton(BTN.yenile, "Yenile", ButtonStyle.Primary, "🔄")
  );

  return [row1, row2, row3];
}

function roleSelectRow(field) {
  return new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`kayit_sel_${field}`)
      .setPlaceholder(`${roleLabels[field]} seç...`)
      .setMinValues(1)
      .setMaxValues(1)
  );
}

function channelSelectRow() {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("kayit_sel_kayitkanal")
      .setPlaceholder("Kayıt kanalını seç...")
      .setChannelTypes([ChannelType.GuildText])
      .setMinValues(1)
      .setMaxValues(1)
  );
}

// Seçici açıldığında altına iptal/geri dönme satırı eklenir
function cancelRow() {
  return new ActionRowBuilder().addComponents(
    makeButton(BTN.cancel, "Geri Dön", ButtonStyle.Secondary, "◀️")
  );
}

function selectStageRows(selectRow) {
  return [selectRow, cancelRow()];
}

function gifModal() {
  return new ModalBuilder()
    .setCustomId("kayit_gif_modal")
    .setTitle("Kayıt Gif Linki")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("kayit_gif_url")
          .setLabel("Gif / görsel linki")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("https://i.imgur.com/abc.gif")
      )
    );
}

// Hoşgeldin mesajı kayıt butonları — customId'ye mesajın sahibi olan üyenin ID'si gömülür
function welcomeButtons(memberId) {
  const erkek = new ButtonBuilder()
    .setCustomId(`kayit_wlc_erkek_${memberId}`)
    .setLabel("Erkek")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("🧍");
  const kadın = new ButtonBuilder()
    .setCustomId(`kayit_wlc_kadin_${memberId}`)
    .setLabel("Kız")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("👩");
  const at = new ButtonBuilder()
    .setCustomId(`kayit_wlc_at_${memberId}`)
    .setLabel("At")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("⚔️");
  const yasakla = new ButtonBuilder()
    .setCustomId(`kayit_wlc_yasakla_${memberId}`)
    .setLabel("Yasakla")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("🔨");
  return new ActionRowBuilder().addComponents(erkek, kadın, at, yasakla);
}

// Cinsiyet seçilince isim girişi için modal — hedef üye ID'si de customId'de taşınır
function welcomeNameModal(cinsiyet, memberId) {
  return new ModalBuilder()
    .setCustomId(`kayit_wlc_modal_${cinsiyet}_${memberId}`)
    .setTitle(cinsiyet === "kadın" ? "Kız Kayıt" : "Erkek Kayıt")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("kayit_name_input")
          .setLabel("Kayıt ismi")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("Örn. Ege")
      )
    );
}

async function refreshPanel(guild) {
  const ref = db.get(PANEL_KEY(guild.id));
  if (!ref) return false;

  const channel = guild.channels.cache.get(ref.kanal);
  if (!channel) {
    db.delete(PANEL_KEY(guild.id));
    return false;
  }

  const msg = await channel.messages.fetch(ref.mesaj).catch(() => null);
  if (!msg) {
    db.delete(PANEL_KEY(guild.id));
    return false;
  }

  const page = ref.sayfa || PAGES.AYARLAR;
  await msg.edit(renderPage(guild, page)).catch(() => {});
  return true;
}

// ---------------- HOŞGELDİN EMBED EMOJİLERİ ----------------
// Sunucuya özel benzersiz isimle emojileri indirip oluşturur, ID'lerini db'ye kaydeder.
const WELCOME_EMOJI_DB = (guildId, type) => `wlcEmoji_${guildId}_${type}`;

async function ensureWelcomeEmojis(guild) {
  const types = ["arrow", "verify", "infinity"];
  const sources = types.map(t => ({ type: t, url: config.welcomeEmojis?.[t] }));
  const results = {};

  // Hızlı kontrol: üçü de zaten kuruluysa hiçbir istek/fetch atma
  let allReady = true;
  for (const src of sources) {
    const stored = db.get(WELCOME_EMOJI_DB(guild.id, src.type));
    if (!src.url || !(stored && guild.emojis.cache.has(stored))) {
      allReady = false;
      break;
    }
  }
  if (allReady) {
    for (const src of sources) results[src.type] = db.get(WELCOME_EMOJI_DB(guild.id, src.type));
    return results;
  }

  for (const src of sources) {
    const dbKey = WELCOME_EMOJI_DB(guild.id, src.type);

    // 1) db'de kayıtlı emoji varsa ve hâlâ duruyorsa kullan
    const stored = db.get(dbKey);
    if (stored && guild.emojis.cache.has(stored)) {
      results[src.type] = stored;
      continue;
    }

    // 2) URL yoksa atla
    if (!src.url) continue;

    // 3) Aynı isimle zaten oluşturulmuş emoji varsa kullan (idempotent)
    const name = `xn_${src.type}`;
    const existing = guild.emojis.cache.find(e => e.name === name);
    if (existing) {
      db.set(dbKey, existing.id);
      results[src.type] = existing.id;
      continue;
    }

    // 4) CDN'den indir (animated emojiler .gif olarak çekilir) ve oluştur
    try {
      const res = await fetch(src.url);
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const created = await guild.emojis.create({
        name,
        attachment: buffer,
        reason: "Kayıt sistemi hoşgeldin emojileri"
      });
      db.set(dbKey, created.id);
      results[src.type] = created.id;
    } catch (e) {
      console.log(`[EMOJI] ${src.type} oluşturulamadı: ${e.message}`);
    }
  }

  return results;
}

// Embedde emoji kullanırken önce sunucuya özel emojiyi, yoksa config ismini dener
async function findWelcomeEmoji(guild, type) {
  const stored = db.get(WELCOME_EMOJI_DB(guild.id, type));
  if (stored && guild.emojis.cache.has(stored)) return guild.emojis.cache.get(stored);

  const configName = config[type] || null;
  if (configName) return guild.emojis.cache.find(e => e.name === configName) || null;
  return null;
}

// ---------------- KURULUM ----------------
async function runSetup(guild) {
  const guildId = guild.id;
  const everyone = guild.roles.everyone;
  const names = getNames(guildId);

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

  const erkekRol = await resolveRole(`erkek_${guildId}`, "Erkek", "#3498DB");
  const kadınRol = await resolveRole(`kadın_${guildId}`, "Kadın", "#E91E63");
  const üyeRol = await resolveRole(`üye_${guildId}`, "Üye", "#95A5A6");
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
    kayıtKanal = guild.channels.cache.find(c => c.name === names.kayitkanal && c.isTextBased());
  }

  // Kategori: kayıt kanalının kategorisi, yoksa isimde kategori, o da yoksa oluştur
  let category = kayıtKanal?.parent || guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === names.kategori);
  if (!category) {
    category = await guild.channels.create({
      name: names.kategori,
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
      name: names.kayitkanal,
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

  // Teyit odası (kayıt kategorisi altında bul veya oluştur - tek adet)
  const voiceChannels = [];
  let vc = guild.channels.cache.find(c => c.name === names.teyit && c.isVoiceBased() && c.parentId === category.id);
  if (!vc) {
    vc = await guild.channels.create({
      name: names.teyit,
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
  db.set(`kadın_${guildId}`, kadınRol.id);
  db.set(`üye_${guildId}`, üyeRol.id);
  db.set(`otorol_${guildId}`, kayıtsızRol.id);
  db.set(`kayityetkili_${guildId}`, yetkiliRol.id);
  db.set(`kayitkanal_${guildId}`, kayıtKanal.id);

  db.set(RECORD_KEY(guildId), {
    kayitsizRoleId: kayıtsızRol.id,
    createdRoles,
    createdChannels,
    restricted
  });

  const emojis = await ensureWelcomeEmojis(guild);

  return {
    erkek: erkekRol.id,
    kadın: kadınRol.id,
    üye: üyeRol.id,
    kayitsiz: kayıtsızRol.id,
    yetkili: yetkiliRol.id,
    kategori: category,
    kanal: kayıtKanal,
    teyit: voiceChannels,
    emojis,
    restrictedCount: restricted.length,
    createdRoleCount: createdRoles.length,
    createdChannelCount: createdChannels.length
  };
}

// ---------------- KALDIRMA ----------------
async function runTeardown(guild) {
  const guildId = guild.id;
  const record = db.get(RECORD_KEY(guildId));
  if (!record) return null;

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

  return {
    rol: (record.createdRoles || []).length,
    kanal: (record.createdChannels || []).length,
    kısıt: (record.restricted || []).length
  };
}

// ---------------- SENKRONİZASYON ----------------
// Seynch ile değiştirilen roller ve kanal, kurulu sistemin
// kanal izinlerine hemen yansıtılır (kayıtsız görünmezliği, yetkili yetkileri vb.)
async function syncPermissions(guild) {
  const guildId = guild.id;
  const record = db.get(RECORD_KEY(guildId));
  if (!record) return null;

  const kayitsizId = db.get(`otorol_${guildId}`) || record.kayitsizRoleId;
  const yetkiliId = db.get(`kayityetkili_${guildId}`);
  const kayitKanalId = db.get(`kayitkanal_${guildId}`);

  const kayitsizRol = guild.roles.cache.get(kayitsizId);
  const yetkiliRol = yetkiliId ? guild.roles.cache.get(yetkiliId) : null;
  const kayitKanal = kayitKanalId ? guild.channels.cache.get(kayitKanalId) : null;
  const everyone = guild.roles.everyone;

  let category = kayitKanal?.parent || guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === getNames(guildId).kategori);
  if (!category) return record; // Kayıt kategorisi yok, izin senkronu gereksiz

  const teyit = guild.channels.cache.filter(c => c.parentId === category.id && c.isVoiceBased());

  // Kayıt kanalı izinleri
  if (kayitKanal?.isTextBased()) {
    if (kayitsizRol) {
      await kayitKanal.permissionOverwrites.edit(kayitsizRol.id, {
        ViewChannel: true,
        ReadMessageHistory: true
      }).catch(() => {});
    }
    if (yetkiliRol) {
      await kayitKanal.permissionOverwrites.edit(yetkiliRol.id, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
        ManageMessages: true,
        ManageChannels: true
      }).catch(() => {});
    }
    await kayitKanal.permissionOverwrites.edit(everyone.id, {
      ViewChannel: true,
      ReadMessageHistory: true,
      SendMessages: false
    }).catch(() => {});
  }

  // Kategori izinleri
  if (kayitsizRol) {
    await category.permissionOverwrites.edit(kayitsizRol.id, {
      ViewChannel: true,
      Connect: true,
      Speak: true
    }).catch(() => {});
  }
  if (yetkiliRol) {
    await category.permissionOverwrites.edit(yetkiliRol.id, {
      ViewChannel: true,
      Connect: true,
      ManageChannels: true
    }).catch(() => {});
  }

  // Teyit odaları
  for (const vc of teyit.values()) {
    if (kayitsizRol) {
      await vc.permissionOverwrites.edit(kayitsizRol.id, { Connect: true }).catch(() => {});
    }
  }

  // Kayıtsız rolü kategori dışındaki tüm kanallardan gizle; eski kayıtsız rolünün izinlerini kaldır
  const oldKayitsizId = record.kayitsizRoleId;
  const restricted = [];
  for (const channel of guild.channels.cache.values()) {
    if (channel.id === category.id) continue;
    if (channel.parentId === category.id) continue;
    if (kayitsizRol) {
      try {
        await channel.permissionOverwrites.edit(kayitsizRol.id, { ViewChannel: false });
        restricted.push(channel.id);
      } catch {}
    }
    if (oldKayitsizId && oldKayitsizId !== kayitsizRol?.id) {
      try {
        await channel.permissionOverwrites.edit(oldKayitsizId, { ViewChannel: null });
      } catch {}
    }
  }

  // Kayıt kaydını güncelle (teardown doğru rolü geri açsın)
  record.kayitsizRoleId = kayitsizRol?.id || oldKayitsizId;
  record.restricted = restricted;
  db.set(RECORD_KEY(guildId), record);

  return {
    kategori: category.id,
    kanal: kayitKanal?.id || null,
    kısıtlananlar: restricted.length
  };
}

module.exports = {
  RECORD_KEY,
  PANEL_KEY,
  REGISTER_KEYS,
  NAMES_KEY,
  getNames,
  setNames,
  WELCOME_EMOJI_DB,
  ensureWelcomeEmojis,
  findWelcomeEmoji,
  BTN,
  PAGES,
  roleFields,
  roleLabels,
  isInstalled,
  valueLine,
  buildPanelEmbed,
  buildPageEmbed,
  pageRows,
  renderPage,
  getPage,
  setPage,
  mainRows,
  roleSelectRow,
  channelSelectRow,
  cancelRow,
  selectStageRows,
  gifModal,
  welcomeButtons,
  welcomeNameModal,
  refreshPanel,
  runSetup,
  runTeardown,
  syncPermissions
};