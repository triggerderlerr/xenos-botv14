const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const musicManager = require('../../utils/music/MusicManager');

module.exports = {
  name: 'play',
  description: 'İstediğiniz şarkıyı, canlı radyoyu veya oynatma listesini (playlist) çalar.',
  type: 1,
  options: [
    {
      name: 'şarkı',
      description: 'Şarkı adı, tekil şarkı linki veya oynatma listesi (playlist) linki',
      type: 3,
      required: true,
    },
  ],

  run: async (client, interaction) => {
    // Discord 3 saniyelik limitini anında uzatmak için ilk işlem deferReply() olmalıdır
    await interaction.deferReply();

    const { member, guild, channel } = interaction;
    const voiceChannel = member.voice?.channel;

    if (!voiceChannel) {
      return interaction.editReply({
        content: '🚫 | Müzik çalabilmek için bir ses kanalında bulunmalısınız!',
      });
    }

    const permissions = voiceChannel.permissionsFor(guild.members.me);
    if (!permissions.has(PermissionsBitField.Flags.Connect) || !permissions.has(PermissionsBitField.Flags.Speak)) {
      return interaction.editReply({
        content: '🚫 | Ses kanalına katılmak ve konuşmak için yetkim bulunmuyor!',
      });
    }

    const query = interaction.options.getString('şarkı');

    try {
      const songInfo = await musicManager.searchOrResolve(query);

      // 1. Durum: Oynatma Listesi (Playlist)
      if (songInfo.isPlaylist) {
        const result = await musicManager.playPlaylist(
          guild,
          voiceChannel,
          channel,
          songInfo.songs,
          songInfo.title,
          interaction.user.id
        );

        const playlistEmbed = new EmbedBuilder()
          .setColor('#00FF99')
          .setTitle('📑 Oynatma Listesi Sıraya Eklendi')
          .setDescription(`[**${songInfo.title}**](${query})`)
          .addFields(
            { name: '🎶 Toplam Şarkı', value: `\`${songInfo.count} Parça\``, inline: true },
            { name: '▶️ İlk Şarkı', value: `\`${result.firstSong?.title || 'Bilinmiyor'}\``, inline: true },
            { name: '👤 Ekleyen', value: `<@${interaction.user.id}>`, inline: true }
          )
          .setThumbnail(result.firstSong?.thumbnail || null)
          .setFooter({ text: 'Xenos Müzik • Sıra butonundan tüm listeyi görebilirsiniz' });

        await interaction.editReply({ embeds: [playlistEmbed] });

        // Kanaldaki mesaj kirliliğini önlemek için onay mesajını 7 saniye sonra kaldır
        setTimeout(() => interaction.deleteReply().catch(() => {}), 7000);
        return;
      }

      // 2. Durum: Tekil Şarkı
      const song = {
        ...songInfo,
        requesterId: interaction.user.id,
      };

      const result = await musicManager.play(guild, voiceChannel, channel, song);

      if (result.status === 'playing') {
        // Zaten ana panel (nowPlayingMsg) gönderildi, bu onay mesajını 4 saniye sonra temizle
        await interaction.editReply({
          content: `🎶 | **${song.title}** başlatılıyor...`,
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 4000);
      } else {
        const queueEmbed = new EmbedBuilder()
          .setColor('#00FF99')
          .setTitle('📝 Sıraya Eklendi')
          .setDescription(`[**${song.title}**](${song.url})`)
          .addFields(
            { name: '⏱️ Süre', value: `\`${song.duration}\``, inline: true },
            { name: '📊 Sıra', value: `#${result.position}`, inline: true },
            { name: '👤 İsteyen', value: `<@${interaction.user.id}>`, inline: true }
          )
          .setThumbnail(song.thumbnail)
          .setFooter({ text: 'Xenos Müzik' });

        await interaction.editReply({ embeds: [queueEmbed] });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 6000);
      }
    } catch (error) {
      console.error('[Play Command Error]', error);
      return interaction.editReply({
        content: `❌ | Şarkı bulunamadı veya oynatılamadı: \`${error.message}\``,
      });
    }
  },
};
