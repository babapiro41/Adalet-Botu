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

// Express Server
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('EGM Mesai ve Devriye Botu Aktif!');
});

app.listen(PORT, () => {
    console.log(`Web sunucusu ${PORT} portunda başarıyla başlatıldı.`);
});

// MongoDB Bağlantısı
const MONGO_URI = process.env.MONGO_URI;

if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('🍃 MongoDB Veritabanı Bağlantısı Başarılı! Veriler Artık Silinmeyecek.'))
        .catch(err => console.error('❌ MongoDB Bağlantı Hatası:', err));
} else {
    console.warn('⚠️ MONGO_URI değişkeni bulunamadı! Veriler geçici hafızada tutulacak.');
}

// Mongoose Modelleri
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

// Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const aktifMesaieler = new Map();
const aktifDevriyeler = new Map();

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
        console.log('Slash (/) komutları yüklendi.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
    } catch (error) {
        console.error('Komut yükleme hatası:', error);
    }
});

function formatSure(ms) {
    const saniye = Math.floor((ms / 1000) % 60);
    const dakika = Math.floor((ms / (1000 * 60)) % 60);
    const saat = Math.floor(ms / (1000 * 60 * 60));
    return `${saat} saat, ${dakika} dakika, ${saniye} saniye`;
}

// Interaction Dinleyici
client.on('interactionCreate', async interaction => {
    // 1. SLASH KOMUTLARI
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'mesai-panel') {
            const embed = new EmbedBuilder()
                .setTitle('👮‍♂️ EMNİYET GENEL MÜDÜRLÜĞÜ - MESAİ PANELİ')
                .setDescription('Aşağıdaki butonları kullanarak mesai süreçlerinizi yönetebilirsiniz.')
                .setColor(0x003366)
                .setFooter({ text: 'EGM Personel Takip Sistemi' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('mesai_baslat').setLabel('Mesaiye Gir').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('mesai_bitir').setLabel('Mesaiyi Bitir').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('mesai_durum').setLabel('Süremi Gör').setStyle(ButtonStyle.Primary)
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
                new ButtonBuilder().setCustomId('devriye_bitir').setLabel('Devriyeyi Bitir').setStyle(ButtonStyle.Secondary).setEmoji('🏁')
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }
    }

    // 2. BUTON ETKİLEŞİMLERİ
    if (interaction.isButton()) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        // --- DEVRİYE MODAL AÇMA ---
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
                .setPlaceholder('Örn: ADALET-1 / A-12')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const aracInput = new TextInputBuilder()
                .setCustomId('arac_model')
                .setLabel('Kullanılan Ekip Aracı')
                .setPlaceholder('Örn: Megane / Toros / Crown Victoria')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const ekipInput = new TextInputBuilder()
                .setCustomId('ekip_arkadaslari')
                .setLabel('Ekip Arkadaşları (Varsa)')
                .setPlaceholder('Örn: Ahmet / Solo')
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(cagriKoduInput),
                new ActionRowBuilder().addComponents(aracInput),
                new ActionRowBuilder().addComponents(ekipInput)
            );

            await interaction.showModal(modal);
        }

        // --- DEVRİYE BİTİR ---
        if (interaction.customId === 'devriye_bitir') {
            if (!aktifDevriyeler.has(userId)) {
                return interaction.reply({ content: '❌ Aktif bir devriyeniz bulunmuyor!', ephemeral: true });
            }

            const devriyeVeri = aktifDevriyeler.get(userId);
            const gecenSure = Date.now() - devriyeVeri.baslangic;
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

            const bitisEmbed = new EmbedBuilder()
                .setTitle('🏁 Devriye Sonlandırıldı')
                .setColor(0xFF0000)
                .addFields(
                    { name: '👤 Personel', value: `<@${userId}>`, inline: true },
                    { name: '📻 Çağrı Kodu', value: devriyeVeri.cagriKodu, inline: true },
                    { name: '🚘 Araç', value: devriyeVeri.arac, inline: true },
                    { name: '⏱️ Devriye Süresi', value: formatSure(gecenSure), inline: false }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [bitisEmbed] });
        }

        // --- MESAİ BUTONLARI ---
        if (interaction.customId === 'mesai_baslat') {
            if (aktifMesaieler.has(userId)) {
                return interaction.reply({ content: '❌ Zaten aktif bir mesainiz bulunuyor!', ephemeral: true });
            }
            aktifMesaieler.set(userId, Date.now());
            return interaction.reply({ content: '🟢 **Mesainiz başarıyla başlatıldı.** Görevde başarılar!', ephemeral: true });
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

            return interaction.reply({ content: `🔴 **Mesainiz bitirildi.** Süre: **${formatSure(gecenSure)}**`, ephemeral: true });
        }

        if (interaction.customId === 'mesai_durum') {
            let toplamSure = 0;
            if (MONGO_URI) {
                const kayit = await MesaiModel.findOne({ userId, guildId });
                if (kayit) toplamSure = kayit.toplamSure;
            }
            return interaction.reply({ content: `📊 **Toplam Kayıtlı Mesai Süreniz:** ${formatSure(toplamSure)}`, ephemeral: true });
        }
    }

    // 3. MODAL FORMU GÖNDERİLDİĞİNDE
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'devriye_form') {
            const cagriKodu = interaction.fields.getTextInputValue('cagri_kodu');
            const arac = interaction.fields.getTextInputValue('arac_model');
            const ekip = interaction.fields.getTextInputValue('ekip_arkadaslari') || 'Yok (Solo)';

            aktifDevriyeler.set(interaction.user.id, {
                baslangic: Date.now(),
                cagriKodu,
                arac,
                ekip
            });

            const baslaEmbed = new EmbedBuilder()
                .setTitle('🚨 Devriye Başlatıldı')
                .setColor(0x00FF00)
                .addFields(
                    { name: '👤 Devriye Sorumlusu', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '📻 Çağrı Kodu', value: cagriKodu, inline: true },
                    { name: '🚘 Araç', value: arac, inline: true },
                    { name: '👥 Ekip Arkadaşları', value: ekip, inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [baslaEmbed] });
        }
    }
});

client.login(process.env.TOKEN);
