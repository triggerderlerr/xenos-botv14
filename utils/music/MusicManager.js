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

  getCookiePath() {
    const possiblePaths = [
      path.join(__dirname, '../../cookies.txt'),
      path.join(__dirname, '../cookies.txt'),
      path.join(process.cwd(), 'cookies.txt')
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return p;
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
          return res.data.title;
        }
      } catch (_) {}
    }

    return null;
  }

  // Başlıktan gürültüleri (emojiler, 7/24, canlı yayın, parantezler) temizleyip arama terimleri çıkarır
  extractSearchQueries(rawTitle) {
    if (!rawTitle) return [];
    
    // Emojileri ve özel sembolleri temizle
    let clean = rawTitle.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}🔴🔥🎵✨⭐📢]/gu, ' ');
    // Gürültü kelimeleri temizle
    clean = clean.replace(/\b(canlı yayın|canli yayin|live stream|live|7\/24|official|video|music video|audio|lyrics)\b/gi, ' ');
    
    const parts = clean.split(/[|\-–]/).map(p => p.trim()).filter(p => p.length >= 3);
    const queries = [];
    if (parts.length > 0) {
      queries.push(parts[0]);
    }
    if (parts.length > 1) {
      queries.push(parts[1]);
    }
    queries.push(clean.trim());

    // Tekrarlardan arındır
    return [...new Set(queries.filter(q => q && q.length > 2))];
  }

  // Akıllı Arama & Çözme (SoundCloud + YouTube + Fallback)
  async searchOrResolve(query) {
    await this.initPromise;

    const isUrl = /^https?:\/\//i.test(query.trim());
    const target = query.trim();

    // Link ise başlık meta verisini al
    const linkTitle = isUrl ? await this.resolveLinkMetadata(target) : null;

    // 1. Durum: Doğrudan URL girilmişse önce o linki dene
    if (isUrl) {
      try {
        return await this.fetchMetadata(target);
      } catch (err) {
        console.log(`[MUSIC] Link koruması aşılamadı (${err.message}). Başlık çözümleniyor...`);

        if (linkTitle) {
          const searchCandidates = this.extractSearchQueries(linkTitle);
          console.log('[MUSIC] Arama adayları:', searchCandidates);

          for (const cand of searchCandidates) {
            try {
              console.log(`[MUSIC] SoundCloud üzerinden deneniyor: "${cand}"`);
              const res = await this.fetchMetadata(`scsearch1:${cand}`);
              if (res) return res;
            } catch (_) {}
          }
        }

        throw new Error('Parça YouTube bot korumasına takıldı ve SoundCloud eşleşmesi bulunamadı. Lütfen şarkı adını doğrudan yazarak arayın.');
      }
    }

    // 2. Durum: Şarkı adı yazılmışsa (Örn: "tarkan yolla", "duman")
    // SoundCloud'da ara (Datacenter IP engeli kesinlikle YOKTUR)
    try {
      return await this.fetchMetadata(`scsearch1:${target}`);
    } catch (scErr) {
      console.log(`[MUSIC] SoundCloud'da bulunamadı, YouTube araması deneniyor...`);
      try {
        return await this.fetchMetadata(`ytsearch1:${target}`);
      } catch (ytErr) {
        throw new Error(`Şarkı bulunamadı: ${scErr.message}`);
      }
    }
  }

  fetchMetadata(target) {
    return new Promise((resolve, reject) => {
      const args = [
        target,
        '--dump-single-json',
        '--flat-playlist',
        '--no-warnings',
        '--skip-download'
      ];

      const cookieFile = this.getCookiePath();
      if (cookieFile) {
        args.push('--cookies', cookieFile);
      }

      const proc = spawn(this.binaryPath, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', chunk => { stdout += chunk; });
      proc.stderr.on('data', chunk => { stderr += chunk; });

      proc.on('close', code => {
        if (code !== 0 || !stdout.trim()) {
          return reject(new Error(stderr.trim() || 'Şarkı bulunamadı.'));
        }

        try {
          const data = JSON.parse(stdout);
          const entry = data.entries ? data.entries[0] : data;
          if (!entry) return reject(new Error('Sonuç bulunamadı.'));

          resolve({
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

      const cookieFile = this.getCookiePath();
      if (cookieFile) {
        args.push('--cookies', cookieFile);
      }

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

  // FFmpeg ile decode edilmiş PCM stream
  createStreamFromUrl(directAudioUrl) {
    const ffmpegProc = spawn(this.getFfmpegPath(), [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', directAudioUrl,
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1'
    ], {
      stdio: ['ignore', 'pipe', 'ignore']
    });

    ffmpegProc.on('error', err => console.error('[FFMPEG Error]', err.message));
    return ffmpegProc.stdout;
  }

  getControlRow(queue) {
    const isPaused = queue ? queue.paused : false;
    const isLoop = queue ? queue.loop : false;

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

  async play(guild, channel, textChannel, song) {
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
        nowPlayingMsg: null
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
                textChannel.send({ embeds: [
                  new EmbedBuilder()
                    .setColor('#FF9900')
                    .setDescription('🎵 | Şarkı listesi bittiği için ses kanalından ayrıldım.')
                ] }).catch(() => {});
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

    queue.songs.push(song);

    if (queue.songs.length === 1) {
      await this.executePlay(guild.id, song);
      return { status: 'playing', song };
    } else {
      return { status: 'queued', song, position: queue.songs.length - 1 };
    }
  }

  async executePlay(guildId, song) {
    const queue = this.queues.get(guildId);
    if (!queue || !song) return;

    try {
      const directAudioUrl = await this.getDirectAudioUrl(song.url);
      const stream = this.createStreamFromUrl(directAudioUrl);

      const resource = createAudioResource(stream, {
        inputType: StreamType.Raw
      });

      queue.player.play(resource);
      queue.paused = false;

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(song.isLive ? '🔴 Şimdi Yayında (Canlı Radyo)' : '🎶 Şimdi Çalıyor')
        .setDescription(`[**${song.title}**](${song.url})`)
        .addFields(
          { name: '⏱️ Süre / Durum', value: `\`${song.duration}\``, inline: true },
          { name: '👤 Ekleyen', value: `<@${song.requesterId}>`, inline: true },
          { name: '📺 Kanal / Yayıncı', value: `\`${song.uploader}\``, inline: true }
        )
        .setThumbnail(song.thumbnail)
        .setTimestamp()
        .setFooter({ text: 'Xenos Müzik', iconURL: guildId ? (queue.voiceChannel?.guild?.iconURL() || undefined) : undefined });

      const row = this.getControlRow(queue);

      if (queue.nowPlayingMsg) {
        queue.nowPlayingMsg.delete().catch(() => {});
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
