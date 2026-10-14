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
        case 'music_toggle_pause': {
          const isPaused = musicManager.togglePause(guild.id);
          const row = musicManager.getControlRow(queue);
          await interaction.update({ components: [row] });
          await interaction.followUp({
            content: isPaused ? '⏸️ | Müzik duraklatıldı.' : '▶️ | Müzik devam ettiriliyor.',
            ephemeral: true
          });
          break;
        }

        case 'music_skip': {
          musicManager.skip(guild.id);
          await interaction.reply({
            content: '⏭️ | Şarkı başarıyla geçildi.',
            ephemeral: true
          });
          break;
        }

        case 'music_stop': {
          musicManager.stop(guild.id);
          if (queue.nowPlayingMsg) {
            queue.nowPlayingMsg.edit({ components: [] }).catch(() => {});
          }
          await interaction.reply({
            content: '⏹️ | Müzik durduruldu ve odadan ayrılındı.',
            ephemeral: true
          });
          break;
        }

        case 'music_loop': {
          const isLoop = musicManager.toggleLoop(guild.id);
          const row = musicManager.getControlRow(queue);
          await interaction.update({ components: [row] });
          await interaction.followUp({
            content: isLoop ? '🔁 | Şarkı döngüsü açıldı (Şarkı sürekli tekrarlanacak).' : '➡️ | Şarkı döngüsü kapatıldı.',
            ephemeral: true
          });
          break;
        }

        case 'music_queue': {
          if (!queue.songs || queue.songs.length === 0) {
            return interaction.reply({
              content: 'Sırada şarkı bulunmuyor.',
              ephemeral: true
            });
          }

          const currentSong = queue.songs[0];
          const upcoming = queue.songs.slice(1, 11);

          let description = `**Şu An Çalan:**\n🎵 [${currentSong.title}](${currentSong.url}) | \`${currentSong.duration}\`\n\n**Sıradaki Şarkılar:**\n`;

          if (upcoming.length > 0) {
            upcoming.forEach((s, idx) => {
              description += `**${idx + 1}.** [${s.title}](${s.url}) | \`${s.duration}\` (İsteyen: <@${s.requesterId}>)\n`;
            });
            if (queue.songs.length > 11) {
              description += `\n*...ve ${queue.songs.length - 11} şarkı daha.*`;
            }
          } else {
            description += '*Sırada başka şarkı yok.*';
          }

          const queueEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`🎶 Şarkı Sırası (${queue.songs.length} Şarkı)`)
            .setDescription(description)
            .setFooter({ text: `Döngü: ${queue.loop ? 'Açık' : 'Kapalı'}` });

          await interaction.reply({
            embeds: [queueEmbed],
            ephemeral: true
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
