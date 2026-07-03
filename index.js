const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const mesaiHafiza = new Map();

// BURAYA KENDİ DISCORD SUNUCUNDAKİ MESAI LOG KANALININ ID'SINI YAZ
const LOG_KANAL_ID = "BURAYA_LOG_KANAL_ID_YAZIN"; 

client.on('ready', () => {
    console.log(`${client.user.tag} aktif ve adaleti sağlamaya hazır!`);
});

client.on('messageCreate', async (message) => {
    if (message.content === '!mesai-panel' && message.member.permissions.has('Administrator')) {
        const embed = new EmbedBuilder()
            .setTitle('⚖️ T.C. Adalet Bakanlığı Mesai Sistemi')
            .setDescription('Mesaiye başlarken ve bitirirken aşağıdaki butonları kullanınız.\n\n*Not: Mesai süreleriniz sistem tarafından saniye saniye kaydedilmektedir.*')
            .setColor(0x0099FF)
            .setFooter({ text: 'Adalet Bakanlığı Bilgi İşlem' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('mesai_basla').setLabel('Mesai Başlat').setStyle(ButtonStyle.Success).setEmoji('▶️'),
                new ButtonBuilder().setCustomId('mesai_bitir').setLabel('Mesai Bitir').setStyle(ButtonStyle.Danger).setEmoji('⏹️')
            );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete();
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const user = interaction.user;
    const logKanali = interaction.guild.channels.cache.get(LOG_KANAL_ID);

    if (interaction.customId === 'mesai_basla') {
        if (mesaiHafiza.has(user.id)) {
            return interaction.reply({ content: '❌ Zaten aktif bir mesainiz bulunuyor!', ephemeral: true });
        }

        mesaiHafiza.set(user.id, Date.now());
        await interaction.reply({ content: '✅ Mesainiz başarıyla başlatıldı. İyi çalışmalar dileriz.', ephemeral: true });

        if (logKanali) {
            logKanali.send(`▶️ **${user.tag}** (${user.id}) mesaiye **başladı**. \n🕒 Saat: <t:${Math.floor(Date.now() / 1000)}:F>`);
        }
    }

    if (interaction.customId === 'mesai_bitir') {
        if (!mesaiHafiza.has(user.id)) {
            return interaction.reply({ content: '❌ Aktif bir mesainiz bulunmuyor! Önce mesai başlatmalısınız.', ephemeral: true });
        }

        const baslangicTarihi = mesaiHafiza.get(user.id);
        const gecenSureMs = Date.now() - baslangicTarihi;
        const toplamDakika = Math.floor(gecenSureMs / 60000);
        
        mesaiHafiza.delete(user.id);
        await interaction.reply({ content: `⏹️ Mesainiz bitirildi. Toplam çalışma süreniz: **${toplamDakika} dakika**.`, ephemeral: true });

        if (logKanali) {
            logKanali.send(`⏹️ **${user.tag}** mesaiyi **bitirdi**.\n🕒 Süre: **${toplamDakika} dakika**\n📅 Bitiş: <t:${Math.floor(Date.now() / 1000)}:F>`);
        }
    }
});

client.login(process.env.TOKEN);
