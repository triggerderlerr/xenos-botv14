const WELCOME_DEFAULT = {
  baslik: "Sunucumuza Hoşgeldin {member}!",
  mesaj: "Merhaba {member}, Sunucuya **Hoşgeldin!**\n\n" +
    "• Seninle Beraber **{sayi}** Kişiyiz.\n" +
    "• Kayıt Olmak Için **Ses Teyit** Odalarından Birine Geçip Bekleyiniz.\n" +
    "• Kayıt Tarihi: **{tarih}**\n" +
    "• Bu Hesap **{kontrol}**\n" +
    "• **Bol keyifli zaman geçirmeniz dileğiyle..**",
  footer: "Xenos Kayıt Sistemi"
};

const ls = localStorage;
const TOKEN = ls.getItem("xk_token") || "";
const SITE_V = "3";
if (ls.getItem("xk_v") !== SITE_V) { ls.setItem("xk_v", SITE_V); location.reload(); }
let DISCORD_MODE = false;
let D = null;
let ACTIVE = null;

function api(path, opts) {
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { "x-panel-token": TOKEN } : {}),
      ...(opts && opts.headers ? opts.headers : {})
    }
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) {
      if (data.authntozg) { return data; }
      if (data.discord !== undefined) DISCORD_MODE = !!data.discord;
      if (DISCORD_MODE) {
        document.getElementById("loginbar").style.display = "flex";
      } else {
        document.getElementById("tokinput").value = TOKEN;
        document.getElementById("tokenbar").style.display = "flex";
        document.getElementById("tokinput").focus();
      }
      throw new Error(data.error || "Giriş gerekli");
    }
    if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
    return data;
  });
}

let toastTimer;
function toast(msg, isErr) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = "toast", 3000);
}

function saveToken() {
  ls.setItem("xk_token", document.getElementById("tokinput").value.trim());
  document.getElementById("tokenbar").style.display = "none";
  location.reload();
}
document.getElementById("tokinput").addEventListener("keydown", e => { if (e.key === "Enter") saveToken(); });

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function roleName(id) { const r = (D && D.roles.find(r => r.id === id)); return r ? r.name : "?"; }
function chanName(id) { if (!D) return "?"; return (D.textChannels.find(c => c.id === id) || D.voiceChannels.find(c => c.id === id) || D.categories.find(c => c.id === id) || {}).name || "?"; }

async function init() {
  document.querySelectorAll("nav button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("nav .navbtn").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    document.querySelectorAll("section").forEach(s => s.classList.remove("active"));
    document.getElementById("sec-" + b.dataset.sec).classList.add("active");
  }));
  document.getElementById("guildsel").addEventListener("change", e => { if (e.target.value) loadGuild(); });

  const qs = new URLSearchParams(location.search);
  const auth = qs.get("auth");
  if (auth === "denied") toast("Discord girişi iptal edildi.", true);
  else if (auth === "none") toast("Giriş tamamlanamadı. Tekrar dene.", true);
  else if (auth === "error") toast("Giriş hatası: " + (qs.get("msg") || "Bilinmeyen hata"), true);
  if (auth) history.replaceState(null, "", "/");

  try {
    const me = await api("/api/me");
    if (!me || me.auth === "none") return; // api() giriş ekranını gösterdi

    if (me.auth === "discord" && me.user) {
      const chip = document.getElementById("userchip");
      const img = me.user.avatar
        ? '<img src="https://cdn.discordapp.com/avatars/' + me.user.id + "/" + me.user.avatar + '.png?size=64">'
        : "";
      chip.innerHTML = img + '<span>' + esc(me.user.username) + '</span> <a class="link" href="/logout" title="Çıkış yap">✕</a>';
    } else {
      document.getElementById("userchip").innerHTML = '<span>🔑 Token</span>';
    }

    const g = await api("/api/guilds");
    const bs = document.getElementById("botstatus");
    if (g.bot) {
      bs.className = "on";
      document.getElementById("botstatus-txt").textContent = "Bot çevrimiçi • " + g.guilds.length + " sunucu";
      const sel = document.getElementById("guildsel");
      sel.innerHTML = '<option value="">- Sunucu seç -</option>' +
        g.guilds.map(x => '<option value="' + x.id + '">' + esc(x.name) + (x.installed ? "  ✅" : "  ❌") + "</option>").join("");
      const remembered = ls.getItem("xk_guild");
      const pick = g.guilds.find(x => x.id === remembered) || (g.guilds.length === 1 ? g.guilds[0] : null);
      if (pick) { sel.value = pick.id; loadGuild(); }
    } else {
      document.getElementById("botstatus").className = "off";
      document.getElementById("botstatus-txt").textContent = "Bot çevrimiçi değil";
      toast("Bot şu anda çevrimiçi değil", true);
    }
  } catch (e) {
    document.getElementById("botstatus").className = "warn";
    document.getElementById("botstatus-txt").textContent = e.message;
  }
}

async function loadGuild() {
  const gid = document.getElementById("guildsel").value;
  if (!gid) return;
  ACTIVE = gid;
  ls.setItem("xk_guild", gid);
  try {
    D = await api("/api/guild/" + gid);
    renderAll();
    banner(D);
  } catch (e) { toast(e.message, true); }
}

function banner(d) {
  const b = document.getElementById("banner");
  if (!d) return;
  if (!d.installed) {
    b.style.display = "flex";
    b.innerHTML = "⚠️ <b>Kayıt sistemi kurulu değil.</b> " + esc(d.name) + " sunucusunda çalıştırmak için <b>Kayıt Sistemi</b> sekmesinden <b>Kur</b> butonuna bas.";
    return;
  }
  let warned = [];
  (d.settings || []).forEach(s => { if (s.value === "INVALID") warned.push(s.label); });
  if (d.settings.find(x => x.key === "kayitkanal")?.value === "INVALID") {
    warned.push("Kayıt Kanalı");
  }
  if (warned.length) {
    b.style.display = "flex";
    b.innerHTML = "⚠️ Eksik ayarlar: <b>" + esc(warned.join(", ")) + "</b> — <b>Roller</b> ve <b>Kanallar</b> sekmelerinden düzelt.";
  } else {
    b.style.display = "none";
  }
}

function renderAll() { if (!D) return; renderRoller(); renderKanallar(); renderKarsilama(); renderKurulum(); }

function fieldOpts(key) {
  let opts = '<option value="">— Ayarlanmadı —</option>';
  const s = D.settings.find(x => x.key === key);
  const sel = s ? s.value : null;
  if (key === "kayitkanal") {
    opts += D.textChannels.map(c => '<option value="' + c.id + '" ' + (c.id === sel ? "selected" : "") + ">" + esc(c.category + " / " + c.name) + "</option>").join("");
  } else {
    opts += D.roles.map(r => '<option value="' + r.id + '" ' + (r.id === sel ? "selected" : "") + ">" + esc(r.name) + "</option>").join("");
  }
  return opts;
}

function renderRoller() {
  const base = D.settings.filter(s => s.key !== "kayitkanal" && s.key !== "kayıtgif");
  const rows = base.map(s => {
    return '<div class="fld"><label>' + esc(s.label) + '</label><select id="fld_' + s.key + '" onchange="saveField(\'' + s.key + '\')">' + fieldOpts(s.key) + "</select></div>";
  }).join("");
  const gif = '<div class="fld" style="grid-column:1/-1"><label>Kayıt Gif</label><div style="display:flex;gap:8px;align-items:center"><input id="fld_kayıtgif" type="text" value="' + esc(D.settings.find(x => x.key === "kayıtgif").value || "") + '" placeholder="https://...gif"><button class="btn dark" style="flex:none;white-space:nowrap" onclick="saveField(\'kayıtgif\')">Kaydet</button></div></div>';
  document.getElementById("rollerBox").innerHTML =
    (base.length ? '<div class="fldgrid">' + rows + gif + '</div>' : '<div class="muted">Ayarlanabilir rol bulunamadı.</div>');
}

function renderKanallar() {
  document.getElementById("fld_kayitkanal").innerHTML = fieldOpts("kayitkanal");
  document.getElementById("fld_topic").value = D.kayitkanalTopic || "";
  const rec = D.record;
  const box = document.getElementById("statusBox");
  if (!rec) {
    box.innerHTML = '<div class="muted">Sistem kurulu değil.</div>';
    return;
  }
  const kayitKanal = D.settings.find(x => x.key === "kayitkanal")?.value;
  box.innerHTML =
    '<div class="kv"><span>Durum</span><span class="badge on">KURULU</span></div>' +
    '<div class="kv"><span>Roller</span><b>' + ((rec.createdRoles || []).map(id => roleName(id)).join(", ") || "—") + '</b></div>' +
    '<div class="kv"><span>Kanallar</span><b>' + ((rec.createdChannels || []).map(id => chanName(id)).join(", ") || "—") + '</b></div>' +
    (kayitKanal ? '<div class="kv"><span>Kayıt kanalı</span><b>' + esc(chanName(kayitKanal)) + '</b></div>' : "");
}

function renderKarsilama() {
  const k = D.karsilama || {};
  document.getElementById("w_baslik").value = k.baslik != null && k.baslik !== "" ? k.baslik : WELCOME_DEFAULT.baslik;
  document.getElementById("w_mesaj").value = k.mesaj != null && k.mesaj !== "" ? k.mesaj : WELCOME_DEFAULT.mesaj;
  document.getElementById("w_footer").value = k.footer != null && k.footer !== "" ? k.footer : WELCOME_DEFAULT.footer;
}

document.querySelectorAll("#sec-ayarlar .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const token = chip.textContent.trim();
    const allowed = ["w_baslik", "w_mesaj", "w_footer"];
    let el = document.activeElement;
    if (!allowed.includes(el.id)) el = document.getElementById("w_mesaj");
    const s = el.selectionStart != null ? el.selectionStart : el.value.length;
    const e = el.selectionEnd != null ? el.selectionEnd : s;
    el.value = el.value.slice(0, s) + token + el.value.slice(e);
    const pos = s + token.length;
    el.focus();
    el.setSelectionRange(pos, pos);
  });
});

function renderKurulum() {
  const n = D.names || {};
  document.getElementById("fld_kategoriad").value = n.kategori || "KAYIT";
  document.getElementById("fld_kayitkanalad").value = n.kayitkanal || "reg-chat";
  document.getElementById("fld_teyitad").value = n.teyit || "Ses Teyit";

  document.getElementById("chk_nickAktif").checked = D.nickAktif !== false;
  document.getElementById("fld_nickSablon").value = D.nickSablon || "Isim | Yaş";

  const t = D.types || {};
  document.getElementById("chk_erkek").checked = t.erkek !== false;
  document.getElementById("chk_kadin").checked = t.kadın !== false;
  document.getElementById("chk_uye").checked = t.üye !== false;
}

async function saveTypes() {
  try {
    const body = {
      erkek: document.getElementById("chk_erkek").checked,
      kadın: document.getElementById("chk_kadin").checked,
      üye: document.getElementById("chk_uye").checked
    };
    const r = await api("/api/guild/" + ACTIVE + "/types", { method: "POST", body: JSON.stringify(body) });
    D.types = r.types;
    msgBox(r.message || "Kayıt tipleri kaydedildi.", "ok");
  } catch (e) {
    msgBox(errorMsg(e), "no");
  }
}

async function saveNick() {
  try {
    const body = {
      aktif: document.getElementById("chk_nickAktif").checked,
      sablon: document.getElementById("fld_nickSablon").value.trim()
    };
    if (!body.sablon) return toast("Şablon boş olamaz.", true);
    const r = await api("/api/guild/" + ACTIVE + "/nick", { method: "POST", body: JSON.stringify(body) });
    D.nickAktif = r.nickAktif;
    D.nickSablon = r.nickSablon;
    msgBox(r.message || "Nick ayarları kaydedildi.", "ok");
  } catch (e) {
    msgBox(errorMsg(e), "no");
  }
}

async function saveKanalAd() {
  try {
    const body = {
      kategori: document.getElementById("fld_kategoriad").value.trim(),
      kayitkanal: document.getElementById("fld_kayitkanalad").value.trim(),
      teyit: document.getElementById("fld_teyitad").value.trim()
    };
    if (!body.kategori || !body.kayitkanal || !body.teyit) return toast("Adlar boş olamaz.", true);
    const r = await api("/api/guild/" + ACTIVE + "/kanalad", { method: "POST", body: JSON.stringify(body) });
    msgBox(r.message || "Kanal adları kaydedildi.", "ok");
  } catch (e) {
    msgBox(errorMsg(e), "no");
  }
}

function msgBox(txt, cls) {
  const out = document.getElementById("out");
  out.textContent = txt;
  out.style.color = cls === "ok" ? "var(--acc)" : cls === "no" ? "var(--dim)" : "var(--txt)";
}

async function saveField(key) {
  const el = document.getElementById("fld_" + key);
  if (!el) return;
  const value = el.value.trim();
  if (!value) return toast("Boş değer kaydedilmez.", true);
  try {
    const r = await api("/api/guild/" + ACTIVE + "/setting", { method: "POST", body: JSON.stringify({ key, value }) });
    toast(r.message);
    loadGuild();
  } catch (e) { toast(e.message, true); }
}

async function saveTopic() {
  try {
    const r = await api("/api/guild/" + ACTIVE + "/topic", { method: "POST", body: JSON.stringify({ value: document.getElementById("fld_topic").value }) });
    toast(r.message);
  } catch (e) { toast(e.message, true); }
}

async function saveWelcome() {
  const body = {
    baslik: document.getElementById("w_baslik").value,
    mesaj: document.getElementById("w_mesaj").value,
    footer: document.getElementById("w_footer").value
  };
  try {
    const r = await api("/api/guild/" + ACTIVE + "/welcome", { method: "POST", body: JSON.stringify(body) });
    toast(r.message);
  } catch (e) { toast(e.message, true); }
}

async function setup() {
  try {
    document.getElementById("btnSetup").disabled = true;
    const r = await api("/api/guild/" + ACTIVE + "/setup", { method: "POST" });
    const roller = (D && D.types || {});
    const satirlar = [
      "✅ Kuruldu",
      "Erkek: " + (roller.erkek ? roleName(r.erkek) : "—"),
      "Kadın: " + (roller.kadın ? roleName(r.kadın) : "—"),
      "Üye: " + (roller.üye ? roleName(r.üye) : "—"),
      "Kayıtsız: " + roleName(r.kayitsiz),
      "Yetkili: " + roleName(r.yetkili),
      "Kategori: " + r.kategori,
      "Kanal: " + chanName(r.kanal),
      "Gizlenen: " + r.restrictedCount + " kanal"
    ].join("\n");
    msgBox(satirlar, "ok");
    toast("Sistem kuruldu");
    loadGuild();
  } catch (e) { msgBox(e.message, "no"); toast(e.message, true); }
  document.getElementById("btnSetup").disabled = false;
}

async function teardown() {
  try {
    const r = await api("/api/guild/" + ACTIVE + "/teardown", { method: "POST" });
    let txt = "❌ Kaldırıldı\nSilinecek rol: " + r.rol + " • Silinecek kanal: " + r.kanal + " • Açılacak kanal: " + r.kısıt;
    if (r.errors && r.errors.length) {
      txt += "\n⚠️ Bazı öğeler silinemedi:\n" + r.errors.map(x => "• " + x).join("\n");
    }
    msgBox(txt, "ok");
    toast(r.errors && r.errors.length ? "Kaldırıldı (hata ile)" : "Sistem kaldırıldı");
    loadGuild();
  } catch (e) { msgBox(e.message, "no"); toast(e.message, true); }
}

async function resetAll() {
  if (!confirm("Tüm kayıt ayarları silinecek ve kurulu sistem (kanallar/roller/izinler) kaldırılacak. Emin misin?")) return;
  try {
    const r = await api("/api/guild/" + ACTIVE + "/reset", { method: "POST" });
    toast(r.message || "Sıfırlandı");
    if (r.errors && r.errors.length) toast(r.errors.length + " öğe silinemedi!", true);
    loadGuild();
  } catch (e) { toast(e.message, true); }
}

init().catch(e => {
  document.getElementById("botstatus").className = "warn";
  document.getElementById("botstatus-txt").textContent = e.message;
});