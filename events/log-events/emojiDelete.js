const { EmbedBuilder } = require('discord.js');
const db = require("croxydb");
const messages = require('../../utils/constants/messages');
const embedBuilder = require("../../utils/helpers/embeds");

module.exports = async (client, emoji) => {
	if (db.get(`logdurum_${emoji.guild.id}`) !== 'açık') return;
	const logchannel = db.get(`logchannels_${emoji.guild.id}`)
	const kanal = emoji.guild.channels.cache.get(logchannel)
	if (!kanal) return;
  await kanal.send({
    embeds: [embedBuilder.emojiD(client, emoji)],
  });
};

