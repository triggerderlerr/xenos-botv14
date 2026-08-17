const { EmbedBuilder } = require('discord.js');
const db = require("croxydb");
const messages = require('../../utils/constants/messages');
const embedBuilder = require("../../utils/helpers/embeds");

module.exports = async (client, channel, time) => {
	if (db.get(`logdurum_${channel.guild.id}`) !== 'açık') return;
	const logchannel = db.get(`logchannels_${channel.guild.id}`)
	const kanal = channel.guild.channels.cache.get(logchannel)
	if (!kanal) return;
  await kanal.send({
    embeds: [embedBuilder.channelP(client, channel)],
  });
};
