const { Collection, EmbedBuilder } = require("discord.js");
const db = require("croxydb");
const client = require("../../index");
const moment = require("moment");
const messages = require('../../utils/constants/messages');

module.exports = async (client, interaction) => {
    if (!client.isReady()) {
        const embed = new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("Bot Henüz Hazır Değil")
            .setDescription("🚫 | Bot şu anda tam olarak yüklenmedi. Lütfen biraz bekleyip tekrar deneyin.")
            .setTimestamp()
            .setFooter({ text: "Bu mesaj otomatik olarak oluşturulmuştur.", iconURL: client.user.displayAvatarURL() });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Botun bulunduğu sunucuları kontrol et
    const allowedGuilds = client.guilds.cache.map(guild => guild.id);
    if (!allowedGuilds.includes(interaction.guildId)) {
        return interaction.reply({
            content: "🚫 | Bu bot yalnızca bulunduğu sunucularda kullanılabilir.",
            ephemeral: true
        });
    }

    if (!interaction.isCommand()) return;

    const userId = interaction.user.id;
    const currentTimestamp = Date.now();
    const cooldownData = db.get(`cooldown_${userId}`);

    if (cooldownData) {
        const cooldownRemaining = cooldownData.timestamp + 10000 - currentTimestamp;

        if (cooldownRemaining > 0) {
            return interaction.reply({
                content: `🔒 | Çok hızlı bir şekilde komut gönderiyorsunuz! Lütfen ${Math.ceil(cooldownRemaining / 1000)} saniye bekleyin.`,
                ephemeral: true
            });
        } else {
            db.delete(`cooldown_${userId}`);
        }
    }

    let userCommandData = db.get(`commandCount_${userId}`);

    if (!userCommandData) {
        db.set(`commandCount_${userId}`, { count: 1, lastCommand: currentTimestamp });
    } else {
        const { count, lastCommand } = userCommandData;

        if (currentTimestamp - lastCommand > 5000) {
            db.set(`commandCount_${userId}`, { count: 1, lastCommand: currentTimestamp });
        } else {
            if (count >= 5) {
                db.set(`cooldown_${userId}`, { timestamp: currentTimestamp });

                return interaction.reply({
                    content: "🔒 | Çok hızlı bir şekilde komut gönderiyorsunuz! Lütfen 10 saniye bekleyin.",
                    ephemeral: true
                });
            }

            db.set(`commandCount_${userId}`, { count: count + 1, lastCommand: currentTimestamp });
        }
    }

    try {
        const command = client.slashCommands.get(interaction.commandName);
        if (!command) {
            return interaction.reply({ content: `${interaction.commandName} geçerli bir komut değil.`, ephemeral: true });
        }

        console.log(`${interaction.guild.name}: Kullanıcı: ${interaction.user.username} => Komut: ${command.name}.`);
        
        // run yerine execute kullanıyoruz
        if (command.execute) {
            await command.execute(client, interaction, interaction.options);
        } else if (command.run) {
            await command.run(client, interaction, interaction.options);
        } else {
            throw new Error("Bu komut için geçerli bir çalıştırma fonksiyonu bulunamadı.");
        }
    } catch (err) {
        console.error(err);
        if (interaction.deferred || interaction.replied) {
            return interaction.followUp({ content: messages.ERRORS.COMMAND_ERROR, ephemeral: true }).catch(() => {});
        } else {
            return interaction.reply({ content: messages.ERRORS.COMMAND_ERROR, ephemeral: true }).catch(() => {});
        }
    }
};
