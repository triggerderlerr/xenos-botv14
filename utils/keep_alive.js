// Xenos Web Paneli — kayıt sistemini tarayıcıdan yönetir (sağlık kontrolünü de korur)
const http = require("http");
const crypto = require("crypto");
const { EmbedBuilder } = require("discord.js");
const db = require("croxydb");
const register = require("./register-system");

const PORT = process.env.PORT || 8080;
// Güvenlik: .env içine WEB_PANEL_TOKEN ekleyerek sabit token verebilirsin.
// Verilmezse ilk açılışta üretilir, veritabanına kaydedilir ve bir daha değişmez.
const PANEL_TOKEN = process.env.WEB_PANEL_TOKEN || (db.get("webpanel_token") || (() => {
  const t = crypto.randomBytes(16).toString("hex");
  db.set("webpanel_token", t);
  return t;
})());

// Discord OAuth2 — .env içine CLIENT_ID ve CLIENT_SECRET eklersen giriş Discord ile olur.
// Eklenecek redirect_uri: WEB_REDIRECT (boşsa http://<host>/callback) — Discord Developer Portal'ında tanımlı olmalı.
const CLIENT_ID = process.env.CLIENT_ID || null;
const CLIENT_SECRET = process.env.CLIENT_SECRET || null;
const DISCORD_OAUTH = !!(CLIENT_ID && CLIENT_SECRET);

const PERM_ADMIN = 8n;
const PERM_MANAGE_ROLES = 268435456n;
const PERM_MANAGE_CHANNELS = 16n;

// Discord'daki oturumlar (sunucu yeniden başlayınca yeniden giriş gerekir)
const sessions = new Map();

const allFields = {
  erkek: "Erkek Rolü",
  kadın: "Kadın Rolü",
  üye: "Üye Rolü",
  otorol: "Kayıtsız Rolü",
  kayityetkili: "Kayıt Yetkilisi",
  kayitkanal: "Kayıt Kanalı",
  "kayıtgif": "Kayıt Gif"
};

const json = (res, code, data) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
};

const tokenAuth = (req) => {
  const header = req.headers["x-panel-token"];
  const url = new URL(req.url, "http://localhost");
  return header === PANEL_TOKEN || url.searchParams.get("token") === PANEL_TOKEN;
};

// Bir kullanıcının sunucuyu yönetebilmesi için yeterli izni var mı?
const canManage = (permissions) => {
  const p = BigInt(permissions || 0);
  return (p & PERM_ADMIN) === PERM_ADMIN ||
    ((p & PERM_MANAGE_ROLES) === PERM_MANAGE_ROLES && (p & PERM_MANAGE_CHANNELS) === PERM_MANAGE_CHANNELS);
};

const getSid = (req) => (req.headers.cookie || "").match(/xenos_sid=([^;]+)/)?.[1] || null;
const setSessCookie = (res, sid) => res.writeHead(302, { Location: "/", "Set-Cookie": `xenos_sid=${sid}; Path=/; HttpOnly; SameSite=Lax` }).end();
const clearSessCookie = (res) => res.writeHead(302, { Location: "/", "Set-Cookie": "xenos_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" }).end();

const discordFetch = async (path, token) => {
  const res = await fetch("https://discord.com/api/v10" + path, { headers: { Authorization: "Bearer " + token } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Discord API " + res.status + " " + (data.message || ""));
  return data;
};

const exchangeCode = async (code, redirect) => {
  const res = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || "Token alınamadı");
  return data;
};

const getRedirect = (req) => {
  if (process.env.WEB_REDIRECT) return process.env.WEB_REDIRECT;
  const host = req.headers.host || `localhost:${PORT}`;
  return `http://${host}/callback`;
};

// İstek sahibini belirler: null => yetkisiz, {type:'token'} => token ile, {type:'discord',...} => Discord ile
const identify = (req) => {
  const sid = getSid(req);
  let sess = sid && sessions.get(sid);
  if (!sess && sid) sess = db.get("webpanel_session_" + sid); // kalıcı oturum
  if (sess) {
    sessions.set(sid, sess);
    return { type: "discord", user: sess.user, guilds: sess.guilds };
  }
  if (tokenAuth(req)) return { type: "token" };
  return null;
};

// Discord oturumuyla bir sunucuyu yönetme izni
const canAccessGuild = (id, caller) => {
  if (!caller) return { ok: false, code: 401, error: "Giriş gerekli" };
  if (caller.type === "token") return { ok: true, caller };
  const client = getClient();
  const guild = client && client.guilds.cache.get(id);
  if (!guild) return { ok: false, code: 404, error: "Bot bu sunucuda değil" };
  const mine = caller.guilds.find(g => g.id === id);
  if (!mine) return { ok: false, code: 403, error: "Bu sunucuyu yönetme yetkin yok" };
  if (!canManage(mine.permissions)) return { ok: false, code: 403, error: "Bu sunucuda Yönetici veya Rolleri/Kanalları Yönet yetkisi gerekli" };
  return { ok: true, caller };
};

const guildPayload = (guild) => ({
  id: guild.id,
  name: guild.name,
  icon: guild.iconURL({ size: 128 }),
  memberCount: guild.memberCount,
  installed: register.isInstalled(guild.id)
});

const guildDetail = (guild) => {
  const gid = guild.id;

  const value = (key) => {
    const v = db.get(`${key}_${gid}`);
    if (!v) return null;
    if (key === "kayitkanal") return guild.channels.cache.get(v) ? v : "INVALID";
    if (key === "kayıtgif") return v;
    return guild.roles.cache.get(v) ? v : "INVALID";
  };

  const kayitKanal = guild.channels.cache.get(db.get(`kayitkanal_${gid}`));

  return {
    installed: register.isInstalled(gid),
    memberCount: guild.memberCount,
    names: register.getNames(gid),
    settings: Object.entries(allFields).map(([key, label]) => ({
      key,
      label,
      value: value(key)
    })),
    roles: guild.roles.cache
      .filter(r => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => ({ id: r.id, name: r.name, color: `#${r.color.toString(16).padStart(6, "0")}` })),
    textChannels: guild.channels.cache
      .filter(c => c.type === 0)
      .sort((a, b) => (a.name < b.name ? -1 : 1))
      .map(c => ({ id: c.id, name: c.name, category: c.parent?.name || "—" })),
    categories: guild.channels.cache
      .filter(c => c.type === 4)
      .sort((a, b) => (a.name < b.name ? -1 : 1))
      .map(c => ({ id: c.id, name: c.name })),
    voiceChannels: guild.channels.cache
      .filter(c => c.type === 2)
      .sort((a, b) => (a.name < b.name ? -1 : 1))
      .map(c => ({ id: c.id, name: c.name, category: c.parent?.name || "—" })),
    members: guild.members.cache
      .filter(m => m.user && !m.user.bot)
      .sort((a, b) => a.user.username.localeCompare(b.user.username))
      .map(m => ({ id: m.user.id, tag: m.user.username })),
    karsilama: db.get(`karsilama_${gid}`) || {},
    kayitkanalTopic: kayitKanal?.topic || "",
    record: db.get(register.RECORD_KEY(gid)) || null,
    stats: db.get(`kayitstat_${gid}`) || null
  };
};

// global.client index.js tarafından atanır; istek anında her zaman hazırdır
const getClient = () => global.client;

const ops = {
  setSetting: async (guild, key, value) => {
    if (!allFields[key]) throw new Error("Geçersiz alan: " + key);
    if (value === "INVALID") throw new Error("Geçersiz değer");
    if (key === "kayıtgif" && !/^https?:/i.test(value)) throw new Error("Gif linki https ile başlamalı");
    db.set(`${key}_${guild.id}`, value);
    if (register.isInstalled(guild.id) && key !== "kayıtgif") {
      await register.syncPermissions(guild).catch(() => {});
    }
    await register.refreshPanel(guild).catch(() => {});
    return { message: `${allFields[key]} kaydedildi.` };
  },
  welcome: async (guild, body) => {
    const current = db.get(`karsilama_${guild.id}`) || {};
    const next = {
      baslik: body.baslik !== undefined ? String(body.baslik).slice(0, 120) : current.baslik,
      mesaj: body.mesaj !== undefined ? String(body.mesaj).slice(0, 1500) : current.mesaj,
      footer: body.footer !== undefined ? String(body.footer).slice(0, 120) : current.footer
    };
    db.set(`karsilama_${guild.id}`, next);
    return { message: "Karşılama mesajı kaydedildi." };
  },
  topic: async (guild, body) => {
    const kanal = guild.channels.cache.get(db.get(`kayitkanal_${guild.id}`));
    if (!kanal) throw new Error("Kayıt kanalı ayarlanmamış");
    await kanal.setTopic(String(body.value || "").slice(0, 1024)).catch(() => {});
    return { message: "Kanal konusu güncellendi." };
  },
  kanalad: async (guild, body) => {
    const next = register.setNames(guild.id, body);
    return { message: "Oluşturulacak kanal adları kaydedildi.", names: next };
  },
  kayit: async (guild, body) => {
    const cinsiyet = ["kadın", "erkek", "üye"].includes(body.cinsiyet) ? body.cinsiyet : "erkek";
    const isim = String(body.isim || "").trim();
    if (!isim) throw new Error("İsim gerekli");

    const member = guild.members.cache.get(body.userId);
    if (!member) throw new Error("Üye bulunamadı (çok büyük sunucularda üye önbellekte olmayabilir)");

    const rol = db.get(`${cinsiyet}_${guild.id}`);
    const kayıtsız = db.get(`otorol_${guild.id}`);
    const kanal = db.get(`kayitkanal_${guild.id}`);
    const gif = db.get(`kayıtgif_${guild.id}`);

    if (!rol) throw new Error(cinsiyet === "kadın" ? "Kadın rolü ayarlanmamış!" : cinsiyet === "erkek" ? "Erkek rolü ayarlanmamış!" : "Üye rolü ayarlanmamış!");
    if (!kayıtsız) throw new Error("Kayıtsız rolü ayarlanmamış!");

    const setName = isim[0].toUpperCase() + isim.slice(1);

    await member.setNickname(setName).catch(() => {});
    await member.roles.add(rol).catch(() => {});
    if (kayıtsız) await member.roles.remove(kayıtsız).catch(() => {});

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
        `• Kayıt işleminde **verilen rol**: <@&${rol}>\n` +
        `• Kayıt işleminde **alınan rol**: <@&${kayıtsız}>`
      )
      .setFooter({ text: `Komutu kullanan yetkili : ${member.user.username}` })
      .setTimestamp();
    if (gif) embed.setImage(gif);

    if (kanal) guild.channels.cache.get(kanal)?.send({ embeds: [embed] }).catch(() => {});

    return { message: `✅ <@${member.user.id}> **${setName}** olarak kaydedildi.` };
  },
  setup: async (guild) => {
    if (register.isInstalled(guild.id)) throw new Error("Sistem zaten kurulu.");
    const res = await register.runSetup(guild);
    await register.refreshPanel(guild).catch(() => {});
    return { erkek: res.erkek, kadın: res.kadın, üye: res.üye, kayitsiz: res.kayitsiz, yetkili: res.yetkili, kategori: res.kategori.name, kanal: res.kanal.id, restrictedCount: res.restrictedCount };
  },
  teardown: async (guild) => {
    if (!register.isInstalled(guild.id)) throw new Error("Kurulu bir sistem yok.");
    const res = await register.runTeardown(guild);
    await register.refreshPanel(guild).catch(() => {});
    return { rol: res.rol, kanal: res.kanal, kısıt: res.kısıt };
  },
  reset: (guild) => {
    for (const key of register.REGISTER_KEYS(guild.id)) db.delete(key);
    db.delete(register.RECORD_KEY(guild.id));
    db.delete(`kayitstat_${guild.id}`);
    register.refreshPanel(guild).catch(() => {});
    return { message: "Kayıt ayarları sıfırlandı." };
  }
};

// ---------------- HTML PANEL (modüler) ----------------
// Panel dosyaları: utils/web/index.html, utils/web/style.css, utils/web/app.js
// Dosyalar her istekte diskten okunur; düzenleyip tarayıcıda yenilemek yeterlidir.
const fs = require("fs");
const path = require("path");

const WEB_DIR = path.join(__dirname, "web");
const readWeb = (name) => fs.readFileSync(path.join(WEB_DIR, name), "utf8");

const sendFile = (res, contentType, data) => {
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store, no-cache, must-revalidate"
  });
  res.end(data);
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");

    // Sağlık kontrolü
    if (url.pathname === "/health") return json(res, 200, { ok: true });

    // Modüler statik dosyalar
    if (url.pathname === "/web/style.css") return sendFile(res, "text/css; charset=utf-8", readWeb("style.css"));
    if (url.pathname === "/web/app.js") return sendFile(res, "application/javascript; charset=utf-8", readWeb("app.js"));
    if (url.pathname === "/") return sendFile(res, "text/html; charset=utf-8", readWeb("index.html"));

    // ---------- Discord OAuth ----------
    if (url.pathname === "/login") {
      if (!DISCORD_OAUTH) {
        res.writeHead(302, { Location: "/" });
        return res.end();
      }
      // Zaten geçerli bir oturum varsa Discord'a gitmeden panele geç.
      const hasSid = getSid(req);
      const sess = hasSid && (sessions.get(hasSid) || db.get("webpanel_session_" + hasSid));
      if (sess) {
        sessions.set(hasSid, sess);
        res.writeHead(302, { Location: "/" });
        return res.end();
      }
      const redirect = getRedirect(req);
      const url2 = "https://discord.com/api/oauth2/authorize" +
        "?client_id=" + encodeURIComponent(CLIENT_ID) +
        "&redirect_uri=" + encodeURIComponent(redirect) +
        "&response_type=code&scope=identify%20guilds" +
        "&prompt=none";
      res.writeHead(302, { Location: url2 });
      return res.end();
    }

    if (url.pathname === "/callback") {
      // Kullanıcı Discord'da izni iptal ederse Discord "error" ile geri yönlendirir.
      const denied = url.searchParams.get("error");
      if (denied) {
        res.writeHead(302, { Location: "/?auth=denied" });
        return res.end();
      }
      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(302, { Location: "/?auth=none" });
        return res.end();
      }
      const redirect = getRedirect(req);
      try {
        const t = await exchangeCode(code, redirect);
        const [user, guilds] = await Promise.all([
          discordFetch("/users/@me", t.access_token),
          discordFetch("/users/@me/guilds", t.access_token)
        ]);
        const nsid = crypto.randomBytes(24).toString("hex");
        const sess = { user, guilds, token: t.access_token };
        sessions.set(nsid, sess);
        db.set("webpanel_session_" + nsid, sess);
        return setSessCookie(res, nsid);
      } catch (e) {
        const err = encodeURIComponent(e.message || "Bilinmeyen hata");
        res.writeHead(302, { Location: "/?auth=error&msg=" + err });
        return res.end();
      }
    }

    if (url.pathname === "/logout") {
      const sid = getSid(req);
      if (sid) {
        sessions.delete(sid);
        db.delete("webpanel_session_" + sid);
      }
      return clearSessCookie(res);
    }

    // ---------- API ----------
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/me") {
        const caller = identify(req);
        if (!caller) return json(res, 401, { error: "Giriş gerekli", auth: "none", discord: DISCORD_OAUTH });
        if (caller.type === "discord") {
          return json(res, 200, { auth: "discord", user: { id: caller.user.id, username: caller.user.username, avatar: caller.user.avatar } });
        }
        return json(res, 200, { auth: "token" });
      }

      if (url.pathname === "/api/guilds" && req.method === "GET") {
        const caller = identify(req);
        if (!caller) return json(res, 401, { error: "Giriş gerekli", auth: "none", discord: DISCORD_OAUTH });
        const client = getClient();
        if (!client || !client.isReady()) return json(res, 200, { bot: false, guilds: [] });
        const bot = client.guilds.cache;
        let list;
        if (caller.type === "discord") {
          list = caller.guilds
            .filter(g => canManage(g.permissions) && bot.has(g.id))
            .map(g => guildPayload(bot.get(g.id)));
        } else {
          list = client.guilds.cache.map(guildPayload);
        }
        return json(res, 200, { bot: true, guilds: list });
      }

      const m = url.pathname.match(/^\/api\/guild\/([^/]+)(?:\/([^/]+))?$/);
      if (m) {
        const gid = m[1];
        const action = m[2] || "";

        const access = canAccessGuild(gid, identify(req));
        if (!access.ok) {
          if (access.code === 401) return json(res, 401, { error: "Giriş gerekli", auth: "none", discord: DISCORD_OAUTH });
          return json(res, access.code, { error: access.error });
        }
        const guild = getClient().guilds.cache.get(gid);

        if (req.method === "GET" && !action) {
          return json(res, 200, guildDetail(guild));
        }

        if (req.method === "POST") {
          const body = action !== "setup" && action !== "teardown" && action !== "reset"
            ? JSON.parse((await readBody(req)) || "{}")
            : {};

          if (action === "setting") return json(res, 200, await ops.setSetting(guild, body.key, body.value));
          if (action === "welcome") return json(res, 200, await ops.welcome(guild, body));
          if (action === "topic") return json(res, 200, await ops.topic(guild, body));
          if (action === "kanalad") return json(res, 200, await ops.kanalad(guild, body));
          if (action === "kayit") return json(res, 200, await ops.kayit(guild, body));
          if (action === "setup") return json(res, 200, await ops.setup(guild));
          if (action === "teardown") return json(res, 200, await ops.teardown(guild));
          if (action === "reset") return json(res, 200, ops.reset(guild));
        }
      }
      return json(res, 404, { error: "Endpoint bulunamadı" });
    }

    json(res, 404, { error: "Bulunamadı" });
  } catch (e) {
    json(res, 500, { error: e.message || "Sunucu hatası" });
  }
});

const readBody = (req) => new Promise(resolve => {
  let data = "";
  req.on("data", chunk => (data += chunk));
  req.on("end", () => resolve(data));
});

server.listen(PORT, () => {
  console.log(`[WEB PANEL] http://localhost:${PORT}`);
  if (DISCORD_OAUTH) {
    console.log(`[WEB PANEL] Discord girişi aktif ✓  •  Redirect URI: ${process.env.WEB_REDIRECT || `http://localhost:${PORT}/callback`}`);
  } else {
    console.log(`[WEB PANEL] Discord girişi için .env'e CLIENT_ID ve CLIENT_SECRET ekle`);
    console.log(`[WEB PANEL] Şu anki erişim kodu (token): ${PANEL_TOKEN}`);
  }
});

module.exports = server;