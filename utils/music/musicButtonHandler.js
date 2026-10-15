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

    try {
      switch (customId) {
        // Duraklat / Devam Et: Yeni mesaj ATMAZ, aynı mesajı yerinde günceller!
        case 'music_toggle_pause': {
          musicManager.togglePause(guild.id);
          const embed = queue.isShowingQueue 
            ? musicManager.getQueueEmbed(guild.id) 
            : musicManager.getNowPlayingEmbed(guild.id);
          const row = musicManager.getControlRow(queue, queue.isShowingQueue);
          await interaction.update({ embeds: [embed], components: [row] });
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
          const embed = queue.isShowingQueue 
            ? musicManager.getQueueEmbed(guild.id) 
            : musicManager.getNowPlayingEmbed(guild.id);
          const row = musicManager.getControlRow(queue, queue.isShowingQueue);
          await interaction.update({ embeds: [embed], components: [row] });
          break;
        }

        // Sıra Butonu: Alt alta mesaj atmak yerine AYNI MESAJI Şarkı Kuyruğu ekranına dönüştürür!
        case 'music_queue': {
          queue.isShowingQueue = true;
          const queueEmbed = musicManager.getQueueEmbed(guild.id);
          const row = musicManager.getControlRow(queue, true);
          await interaction.update({
            embeds: [queueEmbed],
            components: [row]
          });
          break;
        }

        // Geri Dön Butonu: Sıra ekranından tekrar Şimdi Çalıyor ekranına döner!
        case 'music_back_nowplaying': {
          queue.isShowingQueue = false;
          const nowPlayingEmbed = musicManager.getNowPlayingEmbed(guild.id);
          const row = musicManager.getControlRow(queue, false);
          await interaction.update({
            embeds: [nowPlayingEmbed],
            components: [row]
          });
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
        });
      }
    }
  });
};
