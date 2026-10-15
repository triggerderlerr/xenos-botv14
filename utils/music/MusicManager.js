const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  AudioPlayerStatus, 
  VoiceConnectionStatus, 
  StreamType 
} = require('@discordjs/voice');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ffmpegStatic = require('ffmpeg-static');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class MusicManager {
  constructor() {
    this.queues = new Map();
    this.binaryPath = this.resolveYtDlpBinary();
    this.initPromise = this.ensureYtDlpBinary();
  }

  // İşletim sistemine uygun binary yolunu belirler
  resolveYtDlpBinary() {
    const isWin = process.platform === 'win32';
    const localBinDir = path.join(__dirname, '../../bin');
    if (!fs.existsSync(localBinDir)) {
      try { fs.mkdirSync(localBinDir, { recursive: true }); } catch (_) {}
    }

    const localBin = path.join(localBinDir, isWin ? 'yt-dlp.exe' : 'yt-dlp');
    if (fs.existsSync(localBin)) {
      return localBin;
    }

    if (isWin && process.env.LOCALAPPDATA) {
      const wingetPath = path.join(process.env.LOCALAPPDATA, 'Microsoft\\WinGet\\Packages\\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe\\yt-dlp.exe');
      if (fs.existsSync(wingetPath)) {
        return wingetPath;
      }
    }

    return localBin;
  }

  // Binary yoksa doğrudan GitHub CDN'den stream olarak indirir
  async ensureYtDlpBinary() {
    if (fs.existsSync(this.binaryPath)) {
      return this.binaryPath;
    }

    const isWin = process.platform === 'win32';
    const url = isWin
      ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
      : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

    console.log(`[MUSIC] yt-dlp binary indiriliyor (${process.platform}): ${this.binaryPath}`);

    try {
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        maxRedirects: 10,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const writer = fs.createWriteStream(this.binaryPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', () => {
          try {
            if (!isWin) {
              fs.chmodSync(this.binaryPath, 0o755);
            }
            console.log('[MUSIC] yt-dlp başarıyla indirildi ve hazırlandı.');
            resolve();
          } catch (e) {
            reject(e);
          }
        });
        writer.on('error', reject);
      });

      return this.binaryPath;
    } catch (err) {
      console.error('[MUSIC] yt-dlp indirilirken hata:', err.message);
      return 'yt-dlp';
    }
  }

  // Çerez kaynağı önceliği: YT_COOKIES / YT_COOKIES_B64 ortam değişkeni (Render Environment) → cookies.txt dosyası
  getCookiePath() {
    if (this._cookieFileCache !== undefined) return this._cookieFileCache;

    let raw = process.env.YT_COOKIES || '';
    if (!raw && process.env.YT_COOKIES_B64) {
      try { raw = Buffer.from(process.env.YT_COOKIES_B64, 'base64').toString('utf8'); } catch (_) {}
    }

    if (raw && raw.trim()) {
      try {
        // Render'da ortam değişkenleri satır sonlarını "\n" metni olarak taşıyabilir
        raw = raw.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
        if (!/^# (Netscape )?HTTP Cookie File/m.test(raw)) {
          raw = '# Netscape HTTP Cookie File\n' + raw;
        }
        const tmpFile = path.join(require('os').tmpdir(), 'xenos-yt-cookies.txt');
        fs.writeFileSync(tmpFile, raw, { mode: 0o600 });
        console.log('[MUSIC] YouTube çerezleri ortam değişkeninden yüklendi.');
        this._cookieFileCache = tmpFile;
        return tmpFile;
      } catch (e) {
        console.error('[MUSIC] Çerez dosyası yazılamadı:', e.message);
      }
    }

    const possiblePaths = [
      path.join(__dirname, '../../cookies.txt'),
      path.join(__dirname, '../cookies.txt'),
      path.join(process.cwd(), 'cookies.txt')
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        this._cookieFileCache = p;
        return p;
      }
    }
    this._cookieFileCache = null;
    return null;
  }

  // Tüm yt-dlp çağrılarında ortak argümanlar (çerez + isteğe bağlı proxy)
  getCommonArgs() {
    const args = [];
    const cookieFile = this.getCookiePath();
    if (cookieFile) args.push('--cookies', cookieFile);
    if (process.env.YTDLP_PROXY) args.push('--proxy', process.env.YTDLP_PROXY);
    return args;
  }

  // YouTube engellenirse aynı parçayı SoundCloud'da bulur
  async findSoundCloudAlternative(title) {
    const candidates = this.extractSearchQueries(title);
    for (const cand of candidates) {
      try {
        const res = await this.fetchMetadata(`scsearch1:${cand}`, false);
        if (res && !res.isPlaylist && res.url) return res;
      } catch (_) {}
    }
    return null;
  }

  getFfmpegPath() {
    return ffmpegStatic || 'ffmpeg';
  }

  getQueue(guildId) {
    return this.queues.get(guildId);
  }

  // Token olmadan Spotify/YouTube linklerinden başlık çözme (Resmi oEmbed API)
  async resolveLinkMetadata(url) {
    if (/spotify\.com/i.test(url)) {
      try {
        const res = await axios.get(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { timeout: 5000 });
        if (res.data && res.data.title) {
          return res.data.title;
        }
      } catch (_) {}
    }

    if (/youtube\.com|youtu\.be/i.test(url)) {
      try {
        const res = await axios.get(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { timeout: 5000 });
        if (res.data && res.data.title) {
          return `${res.data.title} ${res.data.author_name || ''}`.trim();
        }
      } catch (_) {}
    }

    return null;
  }

  // Başlıktan gürültüleri ayıklar
  extractSearchQueries(rawTitle) {
    if (!rawTitle) return [];
    
    let clean = rawTitle.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}🔴🔥🎵✨⭐📢]/gu, ' ');
    clean = clean.replace(/\b(canlı yayın|canli yayin|live stream|live|7\/24|official|video|music video|audio|lyrics)\b/gi, ' ');
    
    const parts = clean.split(/[|\-–]/).map(p => p.trim()).filter(p => p.length >= 3);
    const queries = [];
    if (parts.length > 0) queries.push(parts[0]);
    if (parts.length > 1) queries.push(parts[1]);
    queries.push(clean.trim());

    return [...new Set(queries.filter(q => q && q.length > 2))];
  }

  // Akıllı Arama & Çözme (Playlist, SoundCloud, YouTube, Fallback)
  async searchOrResolve(query) {
    await this.initPromise;

    const isUrl = /^https?:\/\//i.test(query.trim());
    const isPlaylistUrl = isUrl && /[?&]list=/i.test(query.trim());
    const target = query.trim();

    // 1. Durum: Playlist Linki Girilmişse
    if (isPlaylistUrl) {
      try {
        return await this.fetchMetadata(target, true);
      } catch (err) {
        console.log(`[MUSIC] Playlist yüklenirken hata oluştu: ${err.message}`);
      }
    }

    const linkTitle = isUrl ? await this.resolveLinkMetadata(target) : null;

    // 2. Durum: Normal Tekil URL Girilmişse
    if (isUrl) {
      try {
        return await this.fetchMetadata(target, false);
      } catch (err) {
        console.log(`[MUSIC] Link koruması aşılamadı (${err.message}). Başlık çözümleniyor...`);

        if (linkTitle) {
          const searchCandidates = this.extractSearchQueries(linkTitle);
          for (const cand of searchCandidates) {
            try {
              const res = await this.fetchMetadata(`scsearch1:${cand}`, false);
              if (res) return res;
            } catch (_) {}
          }
        }

        throw new Error('Parça korumaya takıldı ve eşleşme bulunamadı. Lütfen şarkı adını doğrudan yazarak arayın.');
      }
    }

    // 3. Durum: Şarkı Adı Yazılmışsa
    try {
      return await this.fetchMetadata(`scsearch1:${target}`, false);
    } catch (scErr) {
      try {
        return await this.fetchMetadata(`ytsearch1:${target}`, false);
      } catch (_) {
        throw new Error(`Şarkı bulunamadı: ${scErr.message}`);
      }
    }
  }

  fetchMetadata(target, forcePlaylist = false) {
    return new Promise((resolve, reject) => {
      const args = [
        target,
        '--dump-single-json',
        '--flat-playlist',
        '--no-warnings',
        '--skip-download'
      ];

      args.push(...this.getCommonArgs());

      const proc = spawn(this.binaryPath, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', chunk => { stdout += chunk; });
      proc.stderr.on('data', chunk => { stderr += chunk; });

      proc.on('close', code => {
        if (code !== 0 || !stdout.trim()) {
          return reject(new Error(stderr.trim() || 'Veri alınamadı.'));
        }

        try {
          const data = JSON.parse(stdout);

          // Playlist Tespiti:
          if ((forcePlaylist || data._type === 'playlist') && data.entries && data.entries.length > 0) {
            const playlistSongs = data.entries
              .filter(e => e && (e.title || e.url || e.id))
              .map(entry => ({
                title: entry.title || 'Bilinmeyen Başlık',
                url: entry.webpage_url || entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
                duration: entry.duration_string || (entry.duration ? `${Math.floor(entry.duration / 60)}:${('0' + (entry.duration % 60)).slice(-2)}` : 'Bilinmiyor'),
                thumbnail: entry.thumbnail || (entry.thumbnails && entry.thumbnails[0]?.url) || null,
                uploader: entry.uploader || entry.channel || data.uploader || 'Sanatçı',
                id: entry.id,
                isLive: entry.is_live || false
              }));

            return resolve({
              isPlaylist: true,
              title: data.title || 'Oynatma Listesi',
              songs: playlistSongs,
              count: playlistSongs.length,
              url: target
            });
          }

          // Tekil Şarkı:
          const entry = data.entries ? data.entries[0] : data;
          if (!entry) return reject(new Error('Sonuç bulunamadı.'));

          resolve({
            isPlaylist: false,
            title: entry.title || 'Bilinmeyen Başlık',
            url: entry.webpage_url || entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
            duration: entry.duration_string || (entry.duration ? `${Math.floor(entry.duration / 60)}:${('0' + (entry.duration % 60)).slice(-2)}` : 'Canlı Yayın (Radyo)'),
            thumbnail: entry.thumbnail || (entry.thumbnails && entry.thumbnails[0]?.url) || null,
            uploader: entry.uploader || entry.channel || entry.artist || 'Sanatçı / İstasyon',
            id: entry.id,
            isLive: entry.is_live || !entry.duration
          });
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  // Doğrudan ses URL'sini al
  async getDirectAudioUrl(targetUrl) {
    await this.initPromise;

    return new Promise((resolve, reject) => {
      const args = [
        targetUrl,
        '-g',
        '-f', 'ba/b',
        '--no-warnings'
      ];

      args.push(...this.getCommonArgs());

      const proc = spawn(this.binaryPath, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', chunk => { stdout += chunk; });
      proc.stderr.on('data', chunk => { stderr += chunk; });

      proc.on('close', code => {
        const directUrl = stdout.trim().split('\n')[0];
        if (code !== 0 || !directUrl) {
          return reject(new Error(stderr.trim() || 'Ses akış URLsi alınamadı.'));
        }
        resolve(directUrl.trim());
      });
    });
  }

  createStreamFromUrl(directAudioUrl) {
    const ffArgs = [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5'
    ];

    // googlevideo akış linkleri yt-dlp'nin çıktığı IP'ye bağlıdır; proxy kullanılıyorsa FFmpeg de aynı proxy'den geçmeli
    if (process.env.YTDLP_PROXY && /googlevideo\.com/i.test(directAudioUrl)) {
      ffArgs.push('-http_proxy', process.env.YTDLP_PROXY);
    }

    ffArgs.push(
      '-i', directAudioUrl,
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1'
    );

    const ffmpegProc = spawn(this.getFfmpegPath(), ffArgs, {
      stdio: ['ignore', 'pipe', 'ignore']
    });

    ffmpegProc.on('error', err => console.error('[FFMPEG Error]', err.message));
    return ffmpegProc.stdout;
  }

  // Şimdi Çalıyor Embed'ini Üretir
  getNowPlayingEmbed(guildId) {
    const queue = this.queues.get(guildId);
    if (!queue || !queue.songs[0]) return null;

    const song = queue.songs[0];
    const isPaused = queue.paused;
    const isLoop = queue.loop;

    return new EmbedBuilder()
      .setColor(isPaused ? '#FFAA00' : '#5865F2')
      .setTitle(song.isLive ? '🔴 Şimdi Yayında (Canlı Radyo)' : (isPaused ? '⏸️ Müzik Duraklatıldı' : '🎶 Şimdi Çalıyor'))
      .setDescription(`[**${song.title}**](${song.url})`)
      .addFields(
        { name: '⏱️ Süre / Durum', value: `\`${song.duration}\``, inline: true },
        { name: '👤 Ekleyen', value: `<@${song.requesterId}>`, inline: true },
        { name: '📺 Sanatçı / Kanal', value: `\`${song.uploader}\``, inline: true }
      )
      .setThumbnail(song.thumbnail)
      .setFooter({ text: `Xenos Müzik • Döngü: ${isLoop ? 'Açık' : 'Kapalı'} • Sırada: ${queue.songs.length - 1} Parça` });
  }

  // Şarkı Sırası Embed'ini Üretir
  getQueueEmbed(guildId) {
    const queue = this.queues.get(guildId);
    if (!queue || !queue.songs || queue.songs.length === 0) return null;

    const currentSong = queue.songs[0];
    const upcoming = queue.songs.slice(1, 11);

    let description = `**▶️ Şu An Çalan:**\n[${currentSong.title}](${currentSong.url}) | \`${currentSong.duration}\`\n\n**📑 Sıradaki Şarkılar:**\n`;

    if (upcoming.length > 0) {
      upcoming.forEach((s, idx) => {
        description += `**${idx + 1}.** [${s.title}](${s.url}) | \`${s.duration}\`\n`;
      });
      if (queue.songs.length > 11) {
        description += `\n*...ve ${queue.songs.length - 11} şarkı daha.*`;
      }
    } else {
      description += '*Sırada başka şarkı bulunmuyor.*';
    }

    return new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`🎶 Şarkı Kuyruğu (Toplam ${queue.songs.length} Parça)`)
      .setDescription(description)
      .setFooter({ text: `Döngü: ${queue.loop ? 'Açık' : 'Kapalı'} • Sıra ekranındasınız` });
  }

  // Buton Satırını Üretir
  getControlRow(queue, isShowingQueue = false) {
    const isPaused = queue ? queue.paused : false;
    const isLoop = queue ? queue.loop : false;

    if (isShowingQueue) {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('music_back_nowplaying')
          .setEmoji('🔙')
          .setLabel('Şimdi Çalıyor')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('music_skip')
          .setEmoji('⏭️')
          .setLabel('Geç')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('music_stop')
          .setEmoji('⏹️')
          .setLabel('Durdur')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('music_loop')
          .setEmoji('🔁')
          .setLabel(isLoop ? 'Döngü Açık' : 'Döngü Kapalı')
          .setStyle(isLoop ? ButtonStyle.Success : ButtonStyle.Secondary)
      );
    }

    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('music_toggle_pause')
        .setEmoji(isPaused ? '▶️' : '⏸️')
        .setLabel(isPaused ? 'Devam Et' : 'Duraklat')
        .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('music_skip')
        .setEmoji('⏭️')
        .setLabel('Geç')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('music_stop')
        .setEmoji('⏹️')
        .setLabel('Durdur')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('music_loop')
        .setEmoji('🔁')
        .setLabel(isLoop ? 'Döngü Açık' : 'Döngü Kapalı')
        .setStyle(isLoop ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('music_queue')
        .setEmoji('📜')
        .setLabel('Sıra')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  // Ortak Kuyruk Kurucu
  getOrCreateQueue(guild, channel, textChannel) {
    let queue = this.queues.get(guild.id);
    if (!queue) {
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
      });

      const player = createAudioPlayer();

      queue = {
        guildId: guild.id,
        voiceChannel: channel,
        textChannel: textChannel,
        connection: connection,
        player: player,
        songs: [],
        paused: false,
        loop: false,
        nowPlayingMsg: null,
        isShowingQueue: false
      };

      this.queues.set(guild.id, queue);
      connection.subscribe(player);

      player.on(AudioPlayerStatus.Idle, () => {
        if (queue.loop && queue.songs[0]) {
          this.executePlay(guild.id, queue.songs[0]);
        } else {
          queue.songs.shift();
          if (queue.songs.length > 0) {
            this.executePlay(guild.id, queue.songs[0]);
          } else {
            setTimeout(() => {
              const currentQueue = this.queues.get(guild.id);
              if (currentQueue && currentQueue.songs.length === 0) {
                currentQueue.connection.destroy();
                this.queues.delete(guild.id);
                if (currentQueue.nowPlayingMsg) {
                  currentQueue.nowPlayingMsg.edit({
                    embeds: [
                      new EmbedBuilder()
                        .setColor('#FF9900')
                        .setDescription('🎵 | Şarkı listesi bittiği için ses kanalından ayrıldım.')
                    ],
                    components: []
                  }).catch(() => {});
                }
              }
            }, 60000);
          }
        }
      });

      player.on('error', error => {
        console.error('[AudioPlayer Error]', error.message);
        queue.songs.shift();
        if (queue.songs.length > 0) {
          this.executePlay(guild.id, queue.songs[0]);
        }
      });

      connection.on(VoiceConnectionStatus.Disconnected, () => {
        this.queues.delete(guild.id);
      });
    }
    return queue;
  }

  // Tekil Şarkı Oynatma
  async play(guild, channel, textChannel, song) {
    const queue = this.getOrCreateQueue(guild, channel, textChannel);
    queue.songs.push(song);

    if (queue.songs.length === 1) {
      await this.executePlay(guild.id, song);
      return { status: 'playing', song };
    } else {
      // Sıradaki şarkı sayısı değiştiği için ana mesajı da sessizce güncelle
      this.refreshNowPlayingMessage(guild.id);
      return { status: 'queued', song, position: queue.songs.length - 1 };
    }
  }

  // Playlist Oynatma
  async playPlaylist(guild, channel, textChannel, songs, playlistTitle, requesterId) {
    const queue = this.getOrCreateQueue(guild, channel, textChannel);
    const wasEmpty = queue.songs.length === 0;

    const formattedSongs = songs.map(s => ({
      ...s,
      requesterId: requesterId
    }));

    queue.songs.push(...formattedSongs);

    if (wasEmpty && queue.songs.length > 0) {
      await this.executePlay(guild.id, queue.songs[0]);
    } else {
      this.refreshNowPlayingMessage(guild.id);
    }

    return {
      status: wasEmpty ? 'playing_playlist' : 'queued_playlist',
      count: formattedSongs.length,
      firstSong: formattedSongs[0]
    };
  }

  // Mevcut mesajı güncelle (Yeni mesaj göndermeden!)
  async refreshNowPlayingMessage(guildId) {
    const queue = this.queues.get(guildId);
    if (!queue || !queue.nowPlayingMsg) return;

    try {
      const embed = queue.isShowingQueue ? this.getQueueEmbed(guildId) : this.getNowPlayingEmbed(guildId);
      const row = this.getControlRow(queue, queue.isShowingQueue);
      if (embed) {
        await queue.nowPlayingMsg.edit({ embeds: [embed], components: [row] }).catch(() => {});
      }
    } catch (_) {}
  }

  async executePlay(guildId, song) {
    const queue = this.queues.get(guildId);
    if (!queue || !song) return;

    try {
      let directAudioUrl;
      try {
        directAudioUrl = await this.getDirectAudioUrl(song.url);
      } catch (streamErr) {
        // YouTube veri merkezi engeli (bot kontrolü) ise aynı parçayı SoundCloud'dan bulup çal
        if (/sign in|not a bot|cookies|429|403/i.test(streamErr.message) && /youtube\.com|youtu\.be/i.test(song.url)) {
          console.log(`[MUSIC] YouTube akışı engellendi, SoundCloud yedeği deneniyor: "${song.title}"`);
          const alt = await this.findSoundCloudAlternative(song.title);
          if (!alt) throw streamErr;
          song.url = alt.url;
          song.uploader = alt.uploader || song.uploader;
          song.thumbnail = alt.thumbnail || song.thumbnail;
          directAudioUrl = await this.getDirectAudioUrl(alt.url);
        } else {
          throw streamErr;
        }
      }
      const stream = this.createStreamFromUrl(directAudioUrl);

      const resource = createAudioResource(stream, {
        inputType: StreamType.Raw
      });

      queue.player.play(resource);
      queue.paused = false;
      queue.isShowingQueue = false;

      const embed = this.getNowPlayingEmbed(guildId);
      const row = this.getControlRow(queue, false);

      // Eğer zaten kanalda bir mesajımız varsa YENİSİNİ ATMA, MEVCUT OLANINI GÜNCELLE!
      if (queue.nowPlayingMsg) {
        try {
          await queue.nowPlayingMsg.edit({ embeds: [embed], components: [row] });
          return;
        } catch (_) {
          queue.nowPlayingMsg = null;
        }
      }

      queue.nowPlayingMsg = await queue.textChannel.send({
        embeds: [embed],
        components: [row]
      }).catch(() => null);

    } catch (error) {
      console.error('[ExecutePlay Error]', error);
      queue.textChannel.send(`❌ Şarkı çalınırken hata oluştu: ${error.message}`).catch(() => {});
      queue.songs.shift();
      if (queue.songs.length > 0) {
        this.executePlay(guildId, queue.songs[0]);
      }
    }
  }

  skip(guildId) {
    const queue = this.queues.get(guildId);
    if (!queue) return false;
    queue.player.stop();
    return true;
  }

  stop(guildId) {
    const queue = this.queues.get(guildId);
    if (!queue) return false;
    queue.songs = [];
    queue.player.stop();
    if (queue.connection) {
      queue.connection.destroy();
    }
    if (queue.nowPlayingMsg) {
      queue.nowPlayingMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor('#ED4245')
            .setDescription('⏹️ | Müzik durduruldu ve ses kanalından ayrılındı.')
        ],
        components: []
      }).catch(() => {});
    }
    this.queues.delete(guildId);
    return true;
  }

  togglePause(guildId) {
    const queue = this.queues.get(guildId);
    if (!queue) return null;
    if (queue.paused) {
      queue.player.unpause();
      queue.paused = false;
    } else {
      queue.player.pause();
      queue.paused = true;
    }
    return queue.paused;
  }

  toggleLoop(guildId) {
    const queue = this.queues.get(guildId);
    if (!queue) return null;
    queue.loop = !queue.loop;
    return queue.loop;
  }
}

module.exports = new MusicManager();
