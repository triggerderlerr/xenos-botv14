const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const musicManager = require('../../utils/music/MusicManager');

module.exports = {
  name: 'play',
  description: 'İstediğiniz şarkıyı çalar (API token gerektirmez).',
  type: 1,
  options: [
    {
      name: 'şarkı',
      description: 'Çalmak istediğiniz şarkının adı veya linki (YouTube, Spotify, SoundCloud vb.)',
      type: 3,
      required: true,
    },
  ],

  run: async (client, interaction) => {
    const { member, guild, channel } = interaction;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: '🚫 | Müzik çalabilmek için bir ses kanalında bulunmalısınız!',
        ephemeral: true,
      });
    }

    const permissions = voiceChannel.permissionsFor(guild.members.me);
    if (!permissions.has(PermissionsBitField.Flags.Connect) || !permissions.has(PermissionsBitField.Flags.Speak)) {
      return interaction.reply({
        content: '🚫 | Ses kanalına katılmak ve konuşmak için yetkim bulunmuyor!',
        ephemeral: true,
      });
    }

    const query = interaction.options.getString('şarkı');

    await interaction.deferReply();

    try {
      const songInfo = await musicManager.searchOrResolve(query);

      const song = {
        ...songInfo,
        requesterId: interaction.user.id,
      };

      const result = await musicManager.play(guild, voiceChannel, channel, song);

      if (result.status === 'playing') {
        return interaction.editReply({
          content: `🎶 | **${song.title}** çalınmaya başlandı!`,
        });
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
          .setFooter({ text: 'Xenos Müzik Sistemi' });

        return interaction.editReply({
          embeds: [queueEmbed],
        });
      }
    } catch (error) {
      console.error('[Play Command Error]', error);
      return interaction.editReply({
        content: `❌ | Şarkı bulunamadı veya oynatılamadı: \`${error.message}\``,
      });
    }
  },
};
