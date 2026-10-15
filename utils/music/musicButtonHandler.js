const musicManager = require('./MusicManager');
const { EmbedBuilder } = require('discord.js');

module.exports = (client) => {
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('music_')) return;

    const { guild, member, customId } = interaction;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: '🚫 | Müzik butonlarını kullanabilmek için bir ses kanalında olmalısınız.',
        ephemeral: true
      });
    }

    const queue = musicManager.getQueue(guild.id);
    if (!queue) {
      return interaction.reply({
        content: '🚫 | Şu anda çalan bir müzik bulunmuyor.',
        ephemeral: true
      });
    }

    if (queue.voiceChannel.id !== voiceChannel.id) {
      return interaction.reply({
        content: `🚫 | Butonları kullanabilmek için bot ile aynı ses kanalında (<#${queue.voiceChannel.id}>) olmalısınız.`,
        ephemeral: true
      });
    }

    // Kuyrukta çalan şarkı kalmadıysa (şarkı hata verip atılmış olabilir) paneli güvenli şekilde kapat
    if (!queue.songs || queue.songs.length === 0) {
      const endedEmbed = new EmbedBuilder()
        .setColor('#FF9900')
        .setDescription('🎵 | Kuyrukta çalan şarkı kalmadı. Yeni bir şarkı için `/play` kullanın.');
      return interaction.update({ embeds: [endedEmbed], components: [] }).catch(() => {});
    }

    // Aktif görünüme göre doğru embed'i güvenle üretir (asla null göndermez)
    const buildView = (showQueue) => {
      const embed = showQueue
        ? musicManager.getQueueEmbed(guild.id)
        : musicManager.getNowPlayingEmbed(guild.id);
      if (!embed) return null;
      return { embeds: [embed], components: [musicManager.getControlRow(queue, showQueue)] };
    };

    try {
      switch (customId) {
        // Duraklat / Devam Et: Yeni mesaj ATMAZ, aynı mesajı yerinde günceller!
        case 'music_toggle_pause': {
          musicManager.togglePause(guild.id);
          const view = buildView(queue.isShowingQueue);
          if (!view) return interaction.deferUpdate();
          await interaction.update(view);
          break;
        }

        // Şarkıyı Geç: Sessizce sıradaki şarkıya geçer ve aynı mesaj güncellenir!
        case 'music_skip': {
          await interaction.deferUpdate();
          musicManager.skip(guild.id);
          break;
        }

        // Durdur: Mesajı durduruldu durumuna getirir ve butonları kaldırır!
        case 'music_stop': {
          musicManager.stop(guild.id);
          const stopEmbed = new EmbedBuilder()
            .setColor('#ED4245')
            .setDescription('⏹️ | Müzik durduruldu ve ses kanalından ayrılındı.');
          await interaction.update({ embeds: [stopEmbed], components: [] });
          break;
        }

        // Döngü: Yeni mesaj ATMAZ, butonu ve footer bilgisini yerinde günceller!
        case 'music_loop': {
          musicManager.toggleLoop(guild.id);
          const view = buildView(queue.isShowingQueue);
          if (!view) return interaction.deferUpdate();
          await interaction.update(view);
          break;
        }

        // Sıra Butonu: AYNI MESAJI Şarkı Kuyruğu ekranına dönüştürür!
        case 'music_queue': {
          queue.isShowingQueue = true;
          const view = buildView(true);
          if (!view) return interaction.deferUpdate();
          await interaction.update(view);
          break;
        }

        // Geri Dön Butonu: Sıra ekranından tekrar Şimdi Çalıyor ekranına döner!
        case 'music_back_nowplaying': {
          queue.isShowingQueue = false;
          const view = buildView(false);
          if (!view) return interaction.deferUpdate();
          await interaction.update(view);
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('[Music Button Error]', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ | Buton işlemi sırasında bir hata oluştu.',
          ephemeral: true
        }).catch(() => {});
      }
    }
  });
};
