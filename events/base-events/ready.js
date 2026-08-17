const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const { ActivityType } = require('discord.js');
const messages = require('../../utils/constants/messages');

module.exports = async (client) => {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

    try {
        // Global komut yükleme (Collection yerine temiz dizi gönder)
        const apiCommands = Array.from(client.slashCommands.values()).map((cmd) => ({
            name: cmd.name,
            description: cmd.description || "",
            type: cmd.type || 1,
            options: Array.isArray(cmd.options) ? cmd.options : []
        }));

        await rest.put(Routes.applicationCommands(client.user.id), {
            body: apiCommands,
        });
        console.log(`[✅] ${apiCommands.length} komut global olarak başarıyla yüklendi`);
    } catch (error) {
        console.error(`[❌] Komutlar yüklenirken hata: ${error.message}`);
    }

    client.user.setActivity(`/yardım`);
    console.log(`[✅] ${client.user.username} hazır!`);
};
