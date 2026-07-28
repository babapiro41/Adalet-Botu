const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    SlashCommandBuilder, 
    REST, 
    Routes 
} = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');

// Express Server (Render'ın 7/24 uyanık tutması için)
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('EGM Mesai ve Devriye Botu Aktif!');
});

app.listen(PORT, () => {
    console.log(`Web sunucusu ${PORT} portunda başarıyla başlatıldı.`);
});

// MongoDB Veritabanı Bağlantısı
const MONGO_URI = process.env.MONGO_URI;

if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('🍃 MongoDB Veritabanı Bağlantısı Başarılı! Veriler Artık Silinmeyecek.'))
        .catch(err => console.error('❌ MongoDB Bağlantı Hatası:', err));
} else {
    console.warn('⚠️ MONGO_URI değişkeni bulunamadı! Veriler geçici hafızada tutulacak.');
}

// Mongoose Veri Modelleri (Schemas)
const mesaiSchema = new mongoose.Schema({
    userId: String,
    guildId: String,
    baslangic: Number,
    toplamSure: { type: Number, default: 0 }
});

const devriyeSchema = new mongoose.Schema({
    userId: String,
    guildId: String,
    baslangic: Number,
    toplamSure: { type: Number, default: 0 }
});

const MesaiModel = mongoose.model('Mesai', mesaiSchema);
const DevriyeModel = mongoose.model('Devriye', devriyeSchema);

// Discord Client Kurulumu
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Geçici Ram Hafızası (Hızlı erişim için)
const aktifMesaieler = new Map();
const aktifDevriyeler = new Map();

// Bot Hazır Olduğunda Komutları Kaydet
client.once('ready', async () => {
    console.log(`🚨 ${client.user.tag} (EGM Botu) olarak giriş yapıldı!`);

    const commands = [
        new SlashCommandBuilder()
            .setName('mesai-panel')
            .setDescription('EGM Mesai kontrol panelini gönderir.'),
        new SlashCommandBuilder()
            .setName('devriye-panel')
            .setDescription('EGM Devriye kontrol panelini gönderir.')
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
        console.log('Slash (/) komutları Discord\'a yükleniyor...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('✅ Slash (/) komutları başarıyla kaydedildi!');
    } catch (error) {
        console.error('Komut yükleme hatası:', error);
    }
});

// Süre Biçimlendirme Fonksiyonu
function formatSure(ms) {
    const saniye = Math.floor((ms / 1000) % 60);
    const dakika = Math.floor((ms / (1000 * 60)) % 60);
    const saat = Math.floor(ms / (1000 * 60 * 60));
    return `${saat} saat, ${dakika} dakika, ${saniye} saniye`;
}

// Slash Komutlarını Dinleme
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'mesai-panel') {
            const embed = new EmbedBuilder()
                .setTitle('👮‍♂️ EMNİYET GENEL MÜDÜRLÜĞÜ - MESAİ PANELİ')
                .setDescription('Mesaiye başlamak, bitirmek veya süre durumunuzu kontrol etmek için aşağıdaki butonları kullanabilirsiniz.')
                .setColor(0x003366)
                .setFooter({ text: 'EGM Personel Takip Sistemi' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('mesai_baslat').setLabel('🟢 Mesaiye Gir').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('mesai_bitir').setLabel('🔴 Mesaiyi Bitir').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('mesai_durum').setLabel('⏱️ Süremi Gör').setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }

        if (commandName === 'devriye-panel') {
            const embed = new EmbedBuilder()
                .setTitle('🚨 EMNİYET GENEL MÜDÜRLÜĞÜ - DEVRİYE PANELİ')
                .setDescription('Devriyeye çıkmak, devrieyi sonlandırmak veya devriye sürenizi kontrol etmek için aşağıdaki butonları kullanabilirsiniz.')
                .setColor(0x1F618D)
                .setFooter({ text: 'EGM Devriye Takip Sistemi' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('devriye_baslat').setLabel('🚨 Devriyeye Çık').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('devriye_bitir').setLabel('🏁 Devriyeyi Bitir').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('devriye_durum').setLabel('⏱️ Devriye Sürem').setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }
    }

    // Buton Etkileşimleri
    if (interaction.isButton()) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        // --- MESAİ BUTONLARI ---
        if (interaction.customId === 'mesai_baslat') {
            if (aktifMesaieler.has(userId)) {
                return interaction.reply({ content: '❌ Zaten aktif bir mesainiz bulunuyor!', ephemeral: true });
            }
            aktifMesaieler.set(userId, Date.now());
            return interaction.reply({ content: '🟢 **Mesainiz başarıyla başlatıldı.** Görevde başarılar dileriz!', ephemeral: true });
        }

        if (interaction.customId === 'mesai_bitir') {
            if (!aktifMesaieler.has(userId)) {
                return interaction.reply({ content: '❌ Aktif bir mesainiz bulunmuyor!', ephemeral: true });
            }
            const baslangic = aktifMesaieler.get(userId);
            const gecenSure = Date.now() - baslangic;
            aktifMesaieler.delete(userId);

            if (MONGO_URI) {
                let kayit = await MesaiModel.findOne({ userId, guildId });
                if (!kayit) {
                    kayit = new MesaiModel({ userId, guildId, toplamSure: gecenSure });
                } else {
                    kayit.toplamSure += gecenSure;
                }
                await kayit.save();
            }

            return interaction.reply({ content: `🔴 **Mesainiz sonlandırıldı.**\nBu oturumdaki mesai süreniz: **${formatSure(gecenSure)}**`, ephemeral: true });
        }

        if (interaction.customId === 'mesai_durum') {
            let toplamSure = 0;
            if (MONGO_URI) {
                const kayit = await MesaiModel.findOne({ userId, guildId });
                if (kayit) toplamSure = kayit.toplamSure;
            }

            let aktifMetin = '';
            if (aktifMesaieler.has(userId)) {
                const suankiGecen = Date.now() - aktifMesaieler.get(userId);
                aktifMetin = `\n⏱️ **Şu anki aktif mesai süreniz:** ${formatSure(suankiGecen)}`;
            }

            return interaction.reply({ content: `📊 **Toplam Kayıtlı Mesai Süreniz:** ${formatSure(toplamSure)}${aktifMetin}`, ephemeral: true });
        }

        // --- DEVRİYE BUTONLARI ---
        if (interaction.customId === 'devriye_baslat') {
            if (aktifDevriyeler.has(userId)) {
                return interaction.reply({ content: '❌ Zaten aktif bir devriyeniz bulunuyor!', ephemeral: true });
            }
            aktifDevriyeler.set(userId, Date.now());
            return interaction.reply({ content: '🚨 **Devriyeniz başarıyla başlatıldı.** Kazasız belasız devriyeler!', ephemeral: true });
        }

        if (interaction.customId === 'devriye_bitir') {
            if (!aktifDevriyeler.has(userId)) {
                return interaction.reply({ content: '❌ Aktif bir devriyeniz bulunmuyor!', ephemeral: true });
            }
            const baslangic = aktifDevriyeler.get(userId);
            const gecenSure = Date.now() - baslangic;
            aktifDevriyeler.delete(userId);

            if (MONGO_URI) {
                let kayit = await DevriyeModel.findOne({ userId, guildId });
                if (!kayit) {
                    kayit = new DevriyeModel({ userId, guildId, toplamSure: gecenSure });
                } else {
                    kayit.toplamSure += gecenSure;
                }
                await kayit.save();
            }

            return interaction.reply({ content: `🛑 **Devriyeniz sonlandırıldı.**\nBu oturumdaki devriye süreniz: **${formatSure(gecenSure)}**`, ephemeral: true });
        }

        if (interaction.customId === 'devriye_durum') {
            let toplamSure = 0;
            if (MONGO_URI) {
                const kayit = await DevriyeModel.findOne({ userId, guildId });
                if (kayit) toplamSure = kayit.toplamSure;
            }

            let aktifMetin = '';
            if (aktifDevriyeler.has(userId)) {
                const suankiGecen = Date.now() - aktifDevriyeler.get(userId);
                aktifMetin = `\n⏱️ **Şu anki aktif devriye süreniz:** ${formatSure(suankiGecen)}`;
            }

            return interaction.reply({ content: `📊 **Toplam Kayıtlı Devriye Süreniz:** ${formatSure(toplamSure)}${aktifMetin}`, ephemeral: true });
        }
    }
});

// Botu Başlat
client.login(process.env.TOKEN);
