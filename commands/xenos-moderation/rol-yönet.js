const { PermissionsBitField } = require("discord.js");
const db = require("croxydb")
module.exports = {
    name:"rol-yönet",
    description: 'Bir kullanıcıya rol verir/alır.',
    type:1,
    options: [
        {
            name:"kullanıcı",
            description:"Rol verilecek/alınacak kullanıcıyı seçin!",
            type:6,
            required:true
        },
        {
            name:"işlem",
            description:"Yapılacak işlemi seçin!",
            type:3,
            required:true,
            choices:[
            { name: 'Ver', value: 'ver' },
            { name: 'Al', value: 'al' },
          ],

        },
        {
            name:"rol",
            description:"Lütfen bir rol etiketle!",
            type:8,
            required:true
        },

       
       
    ],
  run: async(client, interaction) => {
   const user = interaction.options.getMember('kullanıcı')
   
    if(!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return interaction.reply({content: "Rolleri Yönet Yetkin Yok!", ephemeral: true})
    if(user.permissions.has(PermissionsBitField.Flags.ManageRoles)) return interaction.reply({content:"Bu Kullanıcının Rolleri Yönet Yetkisi Zaten Buluyor.   ",ephemeral:true})
 
    const işlem = interaction.options.getString('işlem')
    const rol = interaction.options.getRole("rol")

    const myHighest = interaction.member.roles.highest;
    const botHighest = interaction.guild.members.me.roles.highest;

    // Hedef rol, komutu kullananın en yüksek rolünden üstte olamaz
    if (rol.position >= myHighest.position) {
      return interaction.reply({ content: `<@&${rol.id}> rolü kendi en yüksek rolünün üstünde! Daha alt bir rol seç.`, ephemeral: true });
    }
    // Bot, kendi rolünün üstündeki bir rolü yönetemez
    if (rol.position >= botHighest.position) {
      return interaction.reply({ content: `<@&${rol.id}> rolü bot'un en yüksek rolünün üstünde! Bot bu rolü yönetemez.`, ephemeral: true });
    }
    // Hedef kullanıcının en yüksek rolü, komutu kullananınkinden üstte veya eşitse ona rol verilemez/alınamaz
    if (user.roles.highest.position >= myHighest.position) {
      return interaction.reply({ content: "Kendinden üst ya da eşit yetkideki bir kullanıcıya rol veremezsin!", ephemeral: true });
    }

      if (işlem === 'al'){
        interaction.guild.members.cache.get(user.id).roles.remove(rol)
         interaction.reply({content: "Başarıyla <@"+user+"> isimli kullanıcının <@&"+rol.id+"> rolü alındı!"})
      }
      
      if (işlem === 'ver'){
          interaction.guild.members.cache.get(user.id).roles.add(rol)
         interaction.reply({content: "Başarıyla <@"+user+"> isimli kullanıcıya <@&"+rol.id+"> rolü verildi!"})
      }
      
       
}};

