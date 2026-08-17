const { EmbedBuilder } = require('discord.js');
const db = require('croxydb');
const messages = require('../../utils/constants/messages');

module.exports = async (client, channel) => {
	try {
		// Log durumu kapalıysa hiçbir kontrol yapma
		if (db.get(`logdurum_${channel.guild.id}`) !== 'açık') return;

		const logChannelId = db.get(`logchannels_${channel.guild.id}`);
		const logChannel = channel.guild.channels.cache.get(logChannelId);
		
		if (!logChannel) return;

		const embed = new EmbedBuilder()
			.setColor('#00ff00')
			.setTitle('Kanal Oluşturuldu')
			.setDescription(`
				**Kanal Adı:** ${channel.name}
				**Kanal Türü:** ${channel.type}
				**Kanal ID:** ${channel.id}
				**Oluşturulma Tarihi:** ${channel.createdAt.toLocaleString('tr-TR')}
			`)
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	} catch (error) {
		console.error('Log hatası:', error);
	}
};


	// 