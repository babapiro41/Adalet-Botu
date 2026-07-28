const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    SlashCommandBuilder, 
    REST, 
    Routes,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');

// ==========================================
// ⚙️ KANAL VE AYAR YAPILANDIRMALARI
// (Buradaki Kanal ID'lerini kendi sunucuna göre doldur)
// ==========================================
const MESAI_LOG_KANAL_ID = '1531433468754530514';   // Örn: '123456789012345678'
const DEVRİYE_LOG_KANAL_ID = '1531466878713593987'; // Örn: '123456789012345678'

// Express Server (Render 7/24 Uyanık Tutma)
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

// Mongoose Veri Modelleri
const mesaiSchema = new mongoose.Schema({
    userId: String,
    guildId: String,
    toplamSure: { type: Number, default: 0 }
});

const devriyeSchema = new mongoose.Schema({
    userId: String,
    guildId: String,
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

// Aktif Takip Hafızası
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
        console.log('Slash (/) komutları yükleniyor...');
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

// Interaction (Komut, Buton, Modal) Dinleyici
client.on('interactionCreate', async interaction => {
    
    // ---------------------------------------------------------
    // 1. SLASH KOMUTLARI PANEL GÖNDERİMİ
    // ---------------------------------------------------------
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'mesai-panel') {
            const embed = new EmbedBuilder()
                .setTitle('👮‍♂️ EMNİYET GENEL MÜDÜRLÜĞÜ - MESAİ PANELİ')
                .setDescription('Aşağıdaki butonları kullanarak mesaiye girebilir, mesaiyi sonlandırabilir veya süre durumunuzu kontrol edebilirsiniz.')
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
                .setTitle('🚨 EMNİYET GENEL MÜDÜRLÜĞÜ - DEVRİYE KONTROL PANELİ')
                .setDescription('Aşağıdaki butonları kullanarak devriye süreçlerinizi yönetebilirsiniz.\n\n🚨 **Devriyeye Çık:** Ekip arkadaşlarınızı, aracınızı ve çağrı kodunuzu seçerek devriye başlatır.\n🏁 **Devriyeyi Bitir:** Aktif devriyenizi sonlandırıp devriye süresini raporlar.')
                .setColor(0x1F618D)
                .setFooter({ text: 'EGM Dijital Devriye Takip Sistemi' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('devriye_baslat_modal').setLabel('Devriyeye Çık').setStyle(ButtonStyle.Primary).setEmoji('🚨'),
                new ButtonBuilder().setCustomId('devriye_bitir').setLabel('Devriyeyi Bitir').setStyle(ButtonStyle.Secondary).setEmoji('🏁'),
                new ButtonBuilder().setCustomId('devriye_durum').setLabel('Devriye Sürem').setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }
    }

    // ---------------------------------------------------------
    // 2. BUTON ETKİLEŞİMLERİ
    // ---------------------------------------------------------
    if (interaction.isButton()) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        // --- MESAİYE GİR ---
        if (interaction.customId === 'mesai_baslat') {
            if (aktifMesaieler.has(userId)) {
                return interaction.reply({ content: '❌ Zaten aktif bir mesainiz bulunuyor!', ephemeral: true });
            }

            const baslangic = Date.now();
            aktifMesaieler.set(userId, baslangic);

            await interaction.reply({ content: '🟢 **Mesainiz başarıyla başlatıldı.** Görevde başarılar dileriz!', ephemeral: true });

            // Mesai Başlangıç Logu
            const logKanal = interaction.guild.channels.cache.get(MESAI_LOG_KANAL_ID);
            if (logKanal) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🟢 Mesai Başlatıldı')
                    .setColor(0x00FF00)
                    .addFields(
                        { name: '👤 Personel', value: `<@${userId}>`, inline: true },
                        { name: '⏰ Başlangıç Zamanı', value: `<t:${Math.floor(baslangic / 1000)}:F>`, inline: true }
                    )
                    .setTimestamp();
                logKanal.send({ embeds: [logEmbed] }).catch(err => console.error('Mesai Log Gönderme Hatası:', err));
            }
        }

        // --- MESAİYİ BİTİR ---
        if (interaction.customId === 'mesai_bitir') {
            if (!aktifMesaieler.has(userId)) {
                return interaction.reply({ content: '❌ Aktif bir mesainiz bulunuyor!', ephemeral: true });
            }

            const baslangic = aktifMesaieler.get(userId);
            const gecenSure = Date.now() - baslangic;
            aktifMesaieler.delete(userId);

            let toplamSure = gecenSure;
            if (MONGO_URI) {
                let kayit = await MesaiModel.findOne({ userId, guildId });
                if (!kayit) {
                    kayit = new MesaiModel({ userId, guildId, toplamSure: gecenSure });
                } else {
                    kayit.toplamSure += gecenSure;
                }
                await kayit.save();
                toplamSure = kayit.toplamSure;
            }

            await interaction.reply({ content: `🔴 **Mesainiz sonlandırıldı.**\nBu oturumdaki mesai süreniz: **${formatSure(gecenSure)}**`, ephemeral: true });

            // Mesai Bitiş Logu
            const logKanal = interaction.guild.channels.cache.get(MESAI_LOG_KANAL_ID);
            if (logKanal) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🔴 Mesai Sonlandırıldı')
                    .setColor(0xFF0000)
                    .addFields(
                        { name: '👤 Personel', value: `<@${userId}>`, inline: true },
                        { name: '⏱️ Oturum Süresi', value: formatSure(gecenSure), inline: true },
                        { name: '📊 Toplam Kayıtlı Süre', value: formatSure(toplamSure), inline: false }
                    )
                    .setTimestamp();
                logKanal.send({ embeds: [logEmbed] }).catch(err => console.error('Mesai Log Gönderme Hatası:', err));
            }
        }

        // --- MESAİ SÜREM ---
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

        // --- DEVRİYEYE ÇIK (MODAL AÇMA) ---
        if (interaction.customId === 'devriye_baslat_modal' || interaction.customId === 'devriye_baslat') {
            if (aktifDevriyeler.has(userId)) {
                return interaction.reply({ content: '❌ Zaten aktif bir devriyeniz bulunuyor!', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('devriye_form')
                .setTitle('🚨 EGM Devriye Başlatma Formu');

            const cagriKoduInput = new TextInputBuilder()
                .setCustomId('cagri_kodu')
                .setLabel('Çağrı Kodunuz')
                .setPlaceholder('Örn: A-12 / A30')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const aracInput = new TextInputBuilder()
                .setCustomId('arac_model')
                .setLabel('Devriye Aracı')
                .setPlaceholder('Örn: Renault Megane / Fiat Egea')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const ekipInput = new TextInputBuilder()
                .setCustomId('ekip_arkadaslari')
                .setLabel('Ekip Arkadaşları (Kişiler)')
                .setPlaceholder('Örn: @Memur1, @Memur2 veya Solo')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(cagriKoduInput),
                new ActionRowBuilder().addComponents(aracInput),
                new ActionRowBuilder().addComponents(ekipInput)
            );

            await interaction.showModal(modal);
        }

        // --- DEVRİYEYİ BİTİR ---
        if (interaction.customId === 'devriye_bitir') {
            if (!aktifDevriyeler.has(userId)) {
                return interaction.reply({ content: '❌ Aktif bir devriyeniz bulunmuyor!', ephemeral: true });
            }

            const devriyeVeri = aktifDevriyeler.get(userId);
            const gecenSure = Date.now() - devriyeVeri.baslangic;
            aktifDevriyeler.delete(userId);

            let toplamSure = gecenSure;
            if (MONGO_URI) {
                let kayit = await DevriyeModel.findOne({ userId, guildId });
                if (!kayit) {
                    kayit = new DevriyeModel({ userId, guildId, toplamSure: gecenSure });
                } else {
                    kayit.toplamSure += gecenSure;
                }
                await kayit.save();
                toplamSure = kayit.toplamSure;
            }

            await interaction.reply({ content: `🛑 **Devriyeniz sonlandırıldı.**\nBu oturumdaki devriye süreniz: **${formatSure(gecenSure)}**`, ephemeral: true });

            // Devriye Bitiş Logu
            const logKanal = interaction.guild.channels.cache.get(DEVRİYE_LOG_KANAL_ID);
            if (logKanal) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🏁 Devriye Sonlandırıldı')
                    .setColor(0xFF0000)
                    .addFields(
                        { name: '👤 Sorumlu Personel', value: `<@${userId}>`, inline: true },
                        { name: '📻 Çağrı Kodu', value: devriyeVeri.cagriKodu, inline: true },
                        { name: '🚘 Devriye Aracı', value: devriyeVeri.arac, inline: true },
                        { name: '👥 Ekip Arkadaşları', value: devriyeVeri.ekip, inline: false },
                        { name: '⏱️ Devriye Süresi', value: formatSure(gecenSure), inline: true },
                        { name: '📊 Toplam Kayıtlı Süre', value: formatSure(toplamSure), inline: true }
                    )
                    .setTimestamp();
                logKanal.send({ embeds: [logEmbed] }).catch(err => console.error('Devriye Log Gönderme Hatası:', err));
            }
        }

        // --- DEVRİYE SÜREM ---
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

    // ---------------------------------------------------------
    // 3. MODAL FORMU GÖNDERİLDİĞİNDE (DEVRİYE BAŞLATMA)
    // ---------------------------------------------------------
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'devriye_form') {
            const cagriKodu = interaction.fields.getTextInputValue('cagri_kodu');
            const arac = interaction.fields.getTextInputValue('arac_model');
            const ekip = interaction.fields.getTextInputValue('ekip_arkadaslari');

            const baslangic = Date.now();

            aktifDevriyeler.set(interaction.user.id, {
                baslangic,
                cagriKodu,
                arac,
                ekip
            });

            await interaction.reply({ content: '🚨 **Devriyeniz başarıyla başlatıldı.** Görevde dikkatli olun!', ephemeral: true });

            // Devriye Başlangıç Logu
            const logKanal = interaction.guild.channels.cache.get(DEVRİYE_LOG_KANAL_ID);
            if (logKanal) {
                const baslaEmbed = new EmbedBuilder()
                    .setTitle('🚨 Devriye Başlatıldı')
                    .setColor(0x00FF00)
                    .addFields(
                        { name: '👤 Devriye Sorumlusu', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '📻 Çağrı Kodu', value: cagriKodu, inline: true },
                        { name: '🚘 Devriye Aracı', value: arac, inline: true },
                        { name: '👥 Ekip Arkadaşları', value: ekip, inline: false },
                        { name: '⏰ Başlangıç Zamanı', value: `<t:${Math.floor(baslangic / 1000)}:F>`, inline: false }
                    )
                    .setTimestamp();

                logKanal.send({ embeds: [baslaEmbed] }).catch(err => console.error('Devriye Log Gönderme Hatası:', err));
            }
        }
    }
});

client.login(process.env.TOKEN);
