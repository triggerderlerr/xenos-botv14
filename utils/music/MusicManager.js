const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  AudioPlayerStatus, 
  VoiceConnectionStatus, 
  StreamType 
} = require('@discordjs/voice');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Standalone yt-dlp, deno ve ffmpeg yolları
const YTDLP_PATH = path.join(process.env.LOCALAPPDATA, 'Microsoft\\WinGet\\Packages\\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe\\yt-dlp.exe');
const DENO_PATH = path.join(process.env.LOCALAPPDATA, 'Microsoft\\WinGet\\Packages\\DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe\\deno.exe');
const FFMPEG_PATH = path.join(process.env.LOCALAPPDATA, 'Microsoft\\WinGet\\Packages\\yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-N-126374-g089a48eb36-win64-gpl\\bin\\ffmpeg.exe');

class MusicManager {
  constructor() {
    this.queues = new Map();
  }

  getQueue(guildId) {
    return this.queues.get(guildId);
  }

  // yt-dlp ile arama veya link çözme (Token gerektirmez!)
  async searchOrResolve(query) {
    return new Promise((resolve, reject) => {
      const isUrl = /^https?:\/\//i.test(query);
      const searchTarget = isUrl ? query : `ytsearch1:${query}`;

      const args = [
        searchTarget,
        '--dump-single-json',
        '--flat-playlist',
        '--no-warnings',
        '--default-search', 'ytsearch',
        '--skip-download'
      ];

      if (fs.existsSync(DENO_PATH)) {
        args.push('--js-runtimes', `deno:${DENO_PATH}`);
      }

      const proc = spawn(fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp', args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', chunk => { stdout += chunk; });
      proc.stderr.on('data', chunk => { stderr += chunk; });

      proc.on('close', code => {
        if (code !== 0 || !stdout.trim()) {
          return reject(new Error(stderr || 'Şarkı bulunamadı.'));
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
            uploader: entry.uploader || entry.channel || 'Sanatçı / İstasyon',
            id: entry.id,
            isLive: entry.is_live || !entry.duration
          });
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  // Doğrudan oynatılabilir ses URL'sini al (Normal videolar + Canlı Yayın / HLS Radyo uyumlu)
  async getDirectAudioUrl(targetUrl) {
    return new Promise((resolve, reject) => {
      const args = [
        targetUrl,
        '-g',
        '-f', 'ba/b',
        '--no-warnings'
      ];

      if (fs.existsSync(DENO_PATH)) {
        args.push('--js-runtimes', `deno:${DENO_PATH}`);
      }

      const proc = spawn(fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp', args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', chunk => { stdout += chunk; });
      proc.stderr.on('data', chunk => { stderr += chunk; });

      proc.on('close', code => {
        const directUrl = stdout.trim().split('\n')[0];
        if (code !== 0 || !directUrl) {
          return reject(new Error(stderr || 'Ses akış URLsi alınamadı.'));
        }
        resolve(directUrl.trim());
      });
    });
  }

  // FFmpeg ile doğrudan decode edilmiş canlı PCM stream üretimi
  createStreamFromUrl(directAudioUrl) {
    const ffmpegBinary = fs.existsSync(FFMPEG_PATH) ? FFMPEG_PATH : 'ffmpeg';
    const ffmpegProc = spawn(ffmpegBinary, [
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

  // Buton satırını üretir
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

  // Şarkıyı oynatır
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
        .setFooter({ text: 'Xenos Müzik', iconURL: guild.iconURL() || undefined });

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
