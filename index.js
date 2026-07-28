const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    SlashCommandBuilder, 
    PermissionFlagsBits,
    REST, 
    Routes,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserSelectMenuBuilder
} = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');

// ==========================================
// ⚙️ LOG KANAL YAPILANDIRMALARI
// ==========================================
const MESAI_LOG_KANAL_ID = '1531433468754530514';
const DEVRIYE_LOG_KANAL_ID = '1531466878713593987';

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
        .then(() => console.log('🍃 MongoDB Veritabanı Bağlantısı Başarılı!'))
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

// Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Aktif Takip Geçici Hafızası
const aktifMesaieler = new Map(); // userId -> timestamp
const aktifDevriyeler = new Map(); // sorumluUserId -> { baslangic, cagriKodu, arac, ekipArray: [{ id, baslangic }] }
const devriyeGeciciEkip = new Map();

// Güvenli Kanal Getirme Fonksiyonu
async function getLogChannel(guild, channelId) {
    if (!channelId) return null;
    let channel = guild.channels.cache.get(channelId);
    if (!channel) {
        try {
            channel = await guild.channels.fetch(channelId);
        } catch (e) {
            console.error(`Kanal çekilemedi (ID: ${channelId}):`, e);
        }
    }
    return channel;
}

function formatSure(ms) {
    if (ms < 0) ms = 0;
    const saniye = Math.floor((ms / 1000) % 60);
    const dakika = Math.floor((ms / (1000 * 60)) % 60);
    const saat = Math.floor(ms / (1000 * 60 * 60));
    return `${saat} saat, ${dakika} dakika, ${saniye} saniye`;
}

// Kullanıcının içinde bulunduğu devriye kaydını ve rolünü bulur
function findUserDevriye(userId) {
    for (const [sorumluId, devriye] of aktifDevriyeler.entries()) {
        if (sorumluId === userId) {
            return { sorumluId, devriye, isSorumlu: true };
        }
        const u = devriye.ekipArray.find(e => e.id === userId);
        if (u) {
            return { sorumluId, devriye, isSorumlu: false, memberData: u };
        }
    }
    return null;
}

client.once('ready', async () => {
    console.log(`🚨 ${client.user.tag} (EGM Botu) olarak giriş yapıldı!`);

    const commands = [
        new SlashCommandBuilder()
            .setName('mesai-panel')
            .setDescription('EGM Mesai kontrol panelini gönderir.'),
        new SlashCommandBuilder()
            .setName('devriye-panel')
            .setDescription('EGM Devriye kontrol panelini gönderir.'),
        new SlashCommandBuilder()
            .setName('aktivite')
            .setDescription('Aktif mesaide ve devriyede olan tüm personelleri gösterir.'),
        new SlashCommandBuilder()
            .setName('mesai-ekle')
            .setDescription('Belirtilen personele manuel mesai süresi ekler.')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
            .addUserOption(opt => opt.setName('kullanici').setDescription('Mesai eklenecek personel').setRequired(true))
            .addIntegerOption(opt => opt.setName('saat').setDescription('Eklenecek saat').setRequired(true))
            .addIntegerOption(opt => opt.setName('dakika').setDescription('Eklenecek dakika').setRequired(false)),
        new SlashCommandBuilder()
            .setName('mesai-sil')
            .setDescription('Belirtilen personelin mesai süresinden düşer.')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
            .addUserOption(opt => opt.setName('kullanici').setDescription('Mesaisi silinecek personel').setRequired(true))
            .addIntegerOption(opt => opt.setName('saat').setDescription('Silinecek saat').setRequired(true))
            .addIntegerOption(opt => opt.setName('dakika').setDescription('Silinecek dakika').setRequired(false)),
        new SlashCommandBuilder()
            .setName('mesai-sorgula')
            .setDescription('Bir personelin toplam mesai süresini sorgular.')
            .addUserOption(opt => opt.setName('kullanici').setDescription('Sorgulanacak personel').setRequired(true)),
        new SlashCommandBuilder()
            .setName('devriye-sorgula')
            .setDescription('Bir personelin toplam devriye süresini sorgular.')
            .addUserOption(opt => opt.setName('kullanici').setDescription('Sorgulanacak personel').setRequired(true))
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('✅ Tüm Slash (/) komutları (Aktivite dahil) yüklendi!');
    } catch (error) {
        console.error('Komut yükleme hatası:', error);
    }
});

client.on('interactionCreate', async interaction => {

    // ==========================================
    // 1. SLASH KOMUTLARI
    // ==========================================
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        const guildId = interaction.guild.id;

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
                .setDescription('Aşağıdaki butonları kullanarak devriye süreçlerinizi yönetebilirsiniz.\n\n🚨 **Devriyeye Çık:** Ekip arkadaşlarınızı, aracınızı ve çağrı kodunuzu seçerek devriye başlatır.\n🏁 **Devriyeyi Bitir:** Tüm devriye ekibinin devriyesini sonlandırır.\n🚪 **Ekipten / Devriyeden Çık:** Sadece kendinizi devriyeden çıkartır ve sürenizi kaydeder.')
                .setColor(0x1F618D)
                .setFooter({ text: 'EGM Dijital Devriye Takip Sistemi' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('devriye_baslat_ekip_sec').setLabel('Devriyeye Çık').setStyle(ButtonStyle.Primary).setEmoji('🚨'),
                new ButtonBuilder().setCustomId('devriye_bitir').setLabel('Devriyeyi Bitir (Tüm Ekip)').setStyle(ButtonStyle.Danger).setEmoji('🏁'),
                new ButtonBuilder().setCustomId('devriye_ayril').setLabel('Ekipten Ayrıl / Çık').setStyle(ButtonStyle.Secondary).setEmoji('🚪'),
                new ButtonBuilder().setCustomId('devriye_durum').setLabel('Devriye Sürem').setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }

        // --- AKTİVİTE KOMUTU ---
        if (commandName === 'aktivite') {
            let mesaiMetin = '';
            if (aktifMesaieler.size === 0) {
                mesaiMetin = '❌ *Şu an aktif mesaide personel bulunmuyor.*';
            } else {
                for (const [uId, start] of aktifMesaieler.entries()) {
                    const gecen = Date.now() - start;
                    mesaiMetin += `• <@${uId}> — **Süre:** ${formatSure(gecen)}\n`;
                }
            }

            let devriyeMetin = '';
            if (aktifDevriyeler.size === 0) {
                devriyeMetin = '❌ *Şu an aktif devriyede personel bulunmuyor.*';
            } else {
                for (const [sorumluId, dVeri] of aktifDevriyeler.entries()) {
                    const gecen = Date.now() - dVeri.baslangic;
                    const ekipEtiketler = dVeri.ekipArray.length > 0 
                        ? dVeri.ekipArray.map(e => `<@${e.id}>`).join(', ') 
                        : 'Solo';

                    devriyeMetin += `🚨 **[${dVeri.cagriKodu}]** — Sorumlu: <@${sorumluId}>\n` +
                        `├ **Araç:** ${dVeri.arac}\n` +
                        `├ **Ekip:** ${ekipEtiketler}\n` +
                        `└ **Geçen Süre:** ${formatSure(gecen)}\n\n`;
                }
            }

            const actEmbed = new EmbedBuilder()
                .setTitle('📊 AKTİF GÖREV & DEVRİYE LİSTESİ')
                .setColor(0x3498DB)
                .addFields(
                    { name: '🟢 AKTİF MESAİDEKİ PERSONELLER', value: mesaiMetin, inline: false },
                    { name: '🚨 AKTİF DEVRİYEDEKİ EKİPLER', value: devriyeMetin, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'EGM Canlı Personel Durumu' });

            await interaction.reply({ embeds: [actEmbed], ephemeral: true });
        }

        // --- MESAİ EKLE ---
        if (commandName === 'mesai-ekle') {
            const hedefUser = interaction.options.getUser('kullanici');
            const saat = interaction.options.getInteger('saat') || 0;
            const dakika = interaction.options.getInteger('dakika') || 0;
            const eklenecekMs = (saat * 60 * 60 * 1000) + (dakika * 60 * 1000);

            if (!MONGO_URI) return interaction.reply({ content: '❌ Veritabanı bağlantısı yok.', ephemeral: true });

            let kayit = await MesaiModel.findOne({ userId: hedefUser.id, guildId });
            if (!kayit) {
                kayit = new MesaiModel({ userId: hedefUser.id, guildId, toplamSure: eklenecekMs });
            } else {
                kayit.toplamSure += eklenecekMs;
            }
            await kayit.save();

            await interaction.reply({
                content: `✅ <@${hedefUser.id}> kişisine **${saat} saat, ${dakika} dakika** mesai eklendi.\n📊 Yeni Toplam: **${formatSure(kayit.toplamSure)}**`,
                ephemeral: true
            });
        }

        // --- MESAİ SİL ---
        if (commandName === 'mesai-sil') {
            const hedefUser = interaction.options.getUser('kullanici');
            const saat = interaction.options.getInteger('saat') || 0;
            const dakika = interaction.options.getInteger('dakika') || 0;
            const silinecekMs = (saat * 60 * 60 * 1000) + (dakika * 60 * 1000);

            if (!MONGO_URI) return interaction.reply({ content: '❌ Veritabanı bağlantısı yok.', ephemeral: true });

            let kayit = await MesaiModel.findOne({ userId: hedefUser.id, guildId });
            if (!kayit || kayit.toplamSure <= 0) {
                return interaction.reply({ content: '❌ Bu personelin kayıtlı mesai süresi yok!', ephemeral: true });
            }

            kayit.toplamSure = Math.max(0, kayit.toplamSure - silinecekMs);
            await kayit.save();

            await interaction.reply({
                content: `🗑️ <@${hedefUser.id}> kişisinin mesaisinden **${saat} saat, ${dakika} dakika** silindi.\n📊 Güncel Toplam: **${formatSure(kayit.toplamSure)}**`,
                ephemeral: true
            });
        }

        // --- MESAİ SORGULA ---
        if (commandName === 'mesai-sorgula') {
            const hedefUser = interaction.options.getUser('kullanici');
            let toplam = 0;
            if (MONGO_URI) {
                const kayit = await MesaiModel.findOne({ userId: hedefUser.id, guildId });
                if (kayit) toplam = kayit.toplamSure;
            }

            let aktifMetin = '';
            if (aktifMesaieler.has(hedefUser.id)) {
                const suankiGecen = Date.now() - aktifMesaieler.get(hedefUser.id);
                aktifMetin = `\n🟢 **Şu an aktif mesaide:** (${formatSure(suankiGecen)})`;
            }

            await interaction.reply({
                content: `🔍 <@${hedefUser.id}> Mesai Bilgisi:\n📊 **Toplam Mesai:** ${formatSure(toplam)}${aktifMetin}`,
                ephemeral: true
            });
        }

        // --- DEVRİYE SORGULA ---
        if (commandName === 'devriye-sorgula') {
            const hedefUser = interaction.options.getUser('kullanici');
            let toplam = 0;
            if (MONGO_URI) {
                const kayit = await DevriyeModel.findOne({ userId: hedefUser.id, guildId });
                if (kayit) toplam = kayit.toplamSure;
            }

            const userDevriyeInfo = findUserDevriye(hedefUser.id);
            let aktifMetin = '';
            if (userDevriyeInfo) {
                const baslangic = userDevriyeInfo.isSorumlu ? userDevriyeInfo.devriye.baslangic : userDevriyeInfo.memberData.baslangic;
                const suankiGecen = Date.now() - baslangic;
                aktifMetin = `\n🚨 **Şu an aktif devriyede:** (${formatSure(suankiGecen)}) [Kod: ${userDevriyeInfo.devriye.cagriKodu}]`;
            }

            await interaction.reply({
                content: `🔍 <@${hedefUser.id}> Devriye Bilgisi:\n📊 **Toplam Devriye:** ${formatSure(toplam)}${aktifMetin}`,
                ephemeral: true
            });
        }
    }

    // ==========================================
    // 2. BUTON ETKİLEŞİMLERİ
    // ==========================================
    if (interaction.isButton()) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        // --- DEVRİYEYE ÇIK ---
        if (interaction.customId === 'devriye_baslat_ekip_sec') {
            if (findUserDevriye(userId)) {
                return interaction.reply({ content: '❌ Zaten aktif bir devriyeniz veya parçası olduğunuz bir ekip bulunuyor!', ephemeral: true });
            }

            const userSelect = new UserSelectMenuBuilder()
                .setCustomId('devriye_ekip_secimi')
                .setPlaceholder('Ekip arkadaşlarınızı seçin')
                .setMinValues(0)
                .setMaxValues(5);

            const row = new ActionRowBuilder().addComponents(userSelect);

            await interaction.reply({
                content: '👥 **Devriyeye çıktığınız ekip arkadaşlarınızı seçin:**\n*(Tek başınızaysanız aşağıdaki butona basabilirsiniz)*',
                components: [
                    row,
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('devriye_form_ac')
                            .setLabel('Devriye Bilgilerini Gir (Tek Başına / Solo)')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('📝')
                    )
                ],
                ephemeral: true
            });
        }

        // --- MESAİYE GİR ---
        if (interaction.customId === 'mesai_baslat') {
            if (aktifMesaieler.has(userId)) {
                return interaction.reply({ content: '❌ Zaten aktif bir mesainiz var!', ephemeral: true });
            }

            const baslangic = Date.now();
            aktifMesaieler.set(userId, baslangic);

            await interaction.reply({ content: '🟢 **Mesainiz başlatıldı.** İyi görevler!', ephemeral: true });

            const logKanal = await getLogChannel(interaction.guild, MESAI_LOG_KANAL_ID);
            if (logKanal) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🟢 Mesai Başlatıldı')
                    .setColor(0x00FF00)
                    .addFields(
                        { name: '👤 Personel', value: `<@${userId}>`, inline: true },
                        { name: '⏰ Başlangıç', value: `<t:${Math.floor(baslangic / 1000)}:F>`, inline: true }
                    )
                    .setTimestamp();
                logKanal.send({ embeds: [logEmbed] }).catch(err => console.error(err));
            }
        }

        // --- MESAİYİ BİTİR ---
        if (interaction.customId === 'mesai_bitir') {
            if (!aktifMesaieler.has(userId)) {
                return interaction.reply({ content: '❌ Aktif bir mesainiz bulunmuyor!', ephemeral: true });
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

            await interaction.reply({ content: `🔴 **Mesainiz sonlandırıldı.**\nOturum Süresi: **${formatSure(gecenSure)}**`, ephemeral: true });

            const logKanal = await getLogChannel(interaction.guild, MESAI_LOG_KANAL_ID);
            if (logKanal) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🔴 Mesai Sonlandırıldı')
                    .setColor(0xFF0000)
                    .addFields(
                        { name: '👤 Personel', value: `<@${userId}>`, inline: true },
                        { name: '⏱️ Oturum Süresi', value: formatSure(gecenSure), inline: true },
                        { name: '📊 Toplam Süre', value: formatSure(toplamSure), inline: false }
                    )
                    .setTimestamp();
                logKanal.send({ embeds: [logEmbed] }).catch(err => console.error(err));
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
                aktifMetin = `\n⏱️ **Aktif Mesai Süreniz:** ${formatSure(suankiGecen)}`;
            }

            return interaction.reply({ content: `📊 **Toplam Kayıtlı Mesai:** ${formatSure(toplamSure)}${aktifMetin}`, ephemeral: true });
        }

        // --- DEVRİYEYİ BİTİR (TÜM EKİP) ---
        if (interaction.customId === 'devriye_bitir') {
            const userDevriyeInfo = findUserDevriye(userId);
            if (!userDevriyeInfo) {
                return interaction.reply({ content: '❌ Aktif bir devriyeniz bulunmuyor!', ephemeral: true });
            }

            if (!userDevriyeInfo.isSorumlu) {
                return interaction.reply({ 
                    content: '⚠️ Tüm devriyeyi bitirme yetkisi sadece devriye sorumlusundadır. Tek başınıza ayrılmak istiyorsanız **"Ekipten Ayrıl / Çık"** butonunu kullanın!', 
                    ephemeral: true 
                });
            }

            const { sorumluId, devriye } = userDevriyeInfo;
            const simdi = Date.now();
            const sorumluGecen = simdi - devriye.baslangic;

            aktifDevriyeler.delete(sorumluId);

            let sorumluToplam = sorumluGecen;
            if (MONGO_URI) {
                let kayit = await DevriyeModel.findOne({ userId: sorumluId, guildId });
                if (!kayit) {
                    kayit = new DevriyeModel({ userId: sorumluId, guildId, toplamSure: sorumluGecen });
                } else {
                    kayit.toplamSure += sorumluGecen;
                }
                await kayit.save();
                sorumluToplam = kayit.toplamSure;

                for (const member of devriye.ekipArray) {
                    const memberGecen = simdi - member.baslangic;
                    let mKayit = await DevriyeModel.findOne({ userId: member.id, guildId });
                    if (!mKayit) {
                        mKayit = new DevriyeModel({ userId: member.id, guildId, toplamSure: memberGecen });
                    } else {
                        mKayit.toplamSure += memberGecen;
                    }
                    await mKayit.save();
                }
            }

            await interaction.reply({ content: `🛑 **Tüm ekip için devriye sonlandırıldı.**\nSüreniz: **${formatSure(sorumluGecen)}**`, ephemeral: true });

            const logKanal = await getLogChannel(interaction.guild, DEVRIYE_LOG_KANAL_ID);
            if (logKanal) {
                const ekipEtiketler = devriye.ekipArray.length > 0 
                    ? devriye.ekipArray.map(e => `<@${e.id}>`).join(', ') 
                    : 'Solo';

                const logEmbed = new EmbedBuilder()
                    .setTitle('🏁 Devriye Sonlandırıldı (Tüm Ekip)')
                    .setColor(0xFF0000)
                    .addFields(
                        { name: '👤 Devriye Sorumlusu', value: `<@${sorumluId}>`, inline: true },
                        { name: '📻 Çağrı Kodu', value: devriye.cagriKodu, inline: true },
                        { name: '🚘 Araç', value: devriye.arac, inline: true },
                        { name: '👥 Ekip Üyeleri', value: ekipEtiketler, inline: false },
                        { name: '⏱️ Devriye Süresi', value: formatSure(sorumluGecen), inline: true }
                    )
                    .setTimestamp();
                logKanal.send({ embeds: [logEmbed] }).catch(err => console.error(err));
            }
        }

        // --- EKİPTEN / DEVRİYEDEN ERKEN ÇIKIŞ YAP ---
        if (interaction.customId === 'devriye_ayril') {
            const userDevriyeInfo = findUserDevriye(userId);
            if (!userDevriyeInfo) {
                return interaction.reply({ content: '❌ Aktif bir devriyeniz bulunmuyor!', ephemeral: true });
            }

            const { sorumluId, devriye, isSorumlu, memberData } = userDevriyeInfo;
            const simdi = Date.now();

            if (isSorumlu) {
                return interaction.reply({ 
                    content: '⚠️ Devriye sorumlusu olduğunuz için devriyeniz tek başınıza bitirilemez. Devriyi kapatmak için **"Devriyeyi Bitir"** butonunu kullanmalısınız.', 
                    ephemeral: true 
                });
            }

            const gecenSure = simdi - memberData.baslangic;
            devriye.ekipArray = devriye.ekipArray.filter(e => e.id !== userId);

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

            await interaction.reply({ 
                content: `🚪 Devriyeden başarıyla ayrıldınız.\nGeçen devriye süreniz (**${formatSure(gecenSure)}**) hesabınıza eklendi. Ekibin devriyesi devam ediyor.`, 
                ephemeral: true 
            });

            const logKanal = await getLogChannel(interaction.guild, DEVRIYE_LOG_KANAL_ID);
            if (logKanal) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🚪 Ekip Üyesi Devriyeden Ayrıldı')
                    .setColor(0xE67E22)
                    .addFields(
                        { name: '👤 Ayrılan Personel', value: `<@${userId}>`, inline: true },
                        { name: '📻 Devriye Kodu', value: devriye.cagriKodu, inline: true },
                        { name: '⏱️ Tamamladığı Süre', value: formatSure(gecenSure), inline: true },
                        { name: '📊 Toplam Kayıtlı Süresi', value: formatSure(toplamSure), inline: true }
                    )
                    .setTimestamp();
                logKanal.send({ embeds: [logEmbed] }).catch(err => console.error(err));
            }
        }

        // --- DEVRİYE SÜREM ---
        if (interaction.customId === 'devriye_durum') {
            let toplamSure = 0;
            if (MONGO_URI) {
                const kayit = await DevriyeModel.findOne({ userId, guildId });
                if (kayit) toplamSure = kayit.toplamSure;
            }

            const userDevriyeInfo = findUserDevriye(userId);
            let aktifMetin = '';
            if (userDevriyeInfo) {
                const baslangic = userDevriyeInfo.isSorumlu ? userDevriyeInfo.devriye.baslangic : userDevriyeInfo.memberData.baslangic;
                const suankiGecen = Date.now() - baslangic;
                aktifMetin = `\n⏱️ **Aktif Devriye Süreniz:** ${formatSure(suankiGecen)}`;
            }

            return interaction.reply({ content: `📊 **Toplam Kayıtlı Devriye Süreniz:** ${formatSure(toplamSure)}${aktifMetin}`, ephemeral: true });
        }

        // --- FORM AÇMA BUTONU ---
        if (interaction.customId === 'devriye_form_ac') {
            const modal = new ModalBuilder()
                .setCustomId('devriye_form')
                .setTitle('🚨 EGM Devriye Detayları');

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

            modal.addComponents(
                new ActionRowBuilder().addComponents(cagriKoduInput),
                new ActionRowBuilder().addComponents(aracInput)
            );

            await interaction.showModal(modal);
        }
    }

    // ==========================================
    // 3. KİŞİ SEÇİMİ (UserSelectMenu)
    // ==========================================
    if (interaction.isUserSelectMenu()) {
        if (interaction.customId === 'devriye_ekip_secimi') {
            const secilenler = interaction.values;
            const ekipMetni = secilenler.length > 0 
                ? secilenler.map(id => `<@${id}>`).join(', ') 
                : 'Solo (Tek Başına)';

            devriyeGeciciEkip.set(interaction.user.id, {
                metin: ekipMetni,
                ids: secilenler
            });

            const devamButon = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('devriye_form_ac')
                    .setLabel('Devriye Bilgilerini Gir (Çağrı Kodu & Araç)')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('📝')
            );

            await interaction.update({
                content: `✅ Ekip Seçildi: **${ekipMetni}**\nŞimdi aşağıdaki butona basarak devriye bilgilerini tamamlayın:`,
                components: [devamButon]
            });
        }
    }

    // ==========================================
    // 4. MODAL SUBMIT
    // ==========================================
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'devriye_form') {
            const cagriKodu = interaction.fields.getTextInputValue('cagri_kodu');
            const arac = interaction.fields.getTextInputValue('arac_model');
            
            const geciciEkip = devriyeGeciciEkip.get(interaction.user.id);
            const ekipMetni = geciciEkip ? geciciEkip.metin : 'Solo (Tek Başına)';
            const ekipIds = geciciEkip ? geciciEkip.ids : [];
            
            devriyeGeciciEkip.delete(interaction.user.id);

            const baslangic = Date.now();
            const ekipArray = ekipIds.map(id => ({ id, baslangic }));

            aktifDevriyeler.set(interaction.user.id, {
                baslangic,
                cagriKodu,
                arac,
                ekipArray
            });

            await interaction.reply({ content: '🚨 **Devriyeniz başarıyla başlatıldı.** Görevde dikkatli olun!', ephemeral: true });

            const logKanal = await getLogChannel(interaction.guild, DEVRIYE_LOG_KANAL_ID);
            if (logKanal) {
                const baslaEmbed = new EmbedBuilder()
                    .setTitle('🚨 Devriye Başlatıldı')
                    .setColor(0x00FF00)
                    .addFields(
                        { name: '👤 Devriye Sorumlusu', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '📻 Çağrı Kodu', value: cagriKodu, inline: true },
                        { name: '🚘 Devriye Aracı', value: arac, inline: true },
                        { name: '👥 Ekip Arkadaşları', value: ekipMetni, inline: false },
                        { name: '⏰ Başlangıç Zamanı', value: `<t:${Math.floor(baslangic / 1000)}:F>`, inline: false }
                    )
                    .setTimestamp();

                logKanal.send({ embeds: [baslaEmbed] }).catch(err => console.error(err));
            }
        }
    }
});

client.login(process.env.TOKEN);
