// ===================================================
// 1. DAHİLİ WEB SUNUCUSU (Render & UptimeRobot 7/24)
// ===================================================
const http = require('http');
const PORT = process.env.PORT || 10000;

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('EGM Bot 7/24 Kesintisiz Aktif!');
}).listen(PORT, '0.0.0.0', () => {
    console.log(`Web sunucusu ${PORT} portunda başarıyla başlatıldı.`);
});

// ===================================================
// 2. DISCORD.JS KURULUMU & KONFİGÜRASYON
// ===================================================
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    UserSelectMenuBuilder, 
    Partials,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

const CONFIG = {
    MESAİ_LOG_KANAL_ID: '1531433468754530514',     // Mesai log kanalı
    DEVRIYE_LOG_KANAL_ID: '1531466878713593987', // Devriye log kanalı
    EGM_LOGO: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/EGM_Logo.png/800px-EGM_Logo.png',
    TOKEN: process.env.TOKEN                       // Render Environment Variables'dan okunur
};

// Veri depolama (Geçici bellek)
const aktifMesailer = new Map();
const aktifDevriyeler = new Map();
const devriyeTaslaklari = new Map();

// ===================================================
// 3. SLASH (/) KOMUTLARININ TANIMLANMASI & KAYDI
// ===================================================
const commands = [
    new SlashCommandBuilder()
        .setName('mesai-panel')
        .setDescription('EGM Mesai Kontrol Paneli kurulumunu yapar.'),
    new SlashCommandBuilder()
        .setName('devriye-panel')
        .setDescription('EGM Devriye Kontrol Paneli kurulumunu yapar.')
].map(command => command.toJSON());

client.once('clientReady', async () => {
    console.log(`🚨 EGM Mesai ve Devriye Botu (${client.user.tag}) Aktif!`);

    // Slash komutlarını Global olarak Discord'a kaydet
    const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
    try {
        console.log('Slash (/) komutları Discord\'a yükleniyor...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('✅ Slash (/) komutları başarıyla kaydedildi!');
    } catch (error) {
        console.error('Slash komut kaydı hatası:', error);
    }
});

// ===================================================
// 4. SLASH KOMUT YÖNETİMİ
// ===================================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // Yönetici Yetki Kontrolü
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ Bu komutu kullanmak için **Yönetici** yetkisine sahip olmalısınız.', ephemeral: true });
    }

    // --- A. /mesai-panel ---
    if (commandName === 'mesai-panel') {
        const embed = new EmbedBuilder()
            .setTitle('👮‍♂️ EMNİYET GENEL MÜDÜRLÜĞÜ - MESAİ KONTROL PANELİ')
            .setDescription(
                'Aşağıdaki butonları kullanarak bireysel mesainizi başlatabilir veya bitirebilirsiniz.\n\n' +
                '🟢 **Mesaiye Gir:** Görevinizi başlatır ve kanala log kaydı düşer.\n' +
                '🔴 **Mesaiyi Bitir:** Görevinizi sonlandırır ve toplam sürenizi hesaplar.'
            )
            .setColor('#003366')
            .setThumbnail(CONFIG.EGM_LOGO)
            .setFooter({ text: 'EGM Dijital Personel Takip Sistemi', iconURL: CONFIG.EGM_LOGO })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_mesai_gir')
                .setLabel('🟢 Mesaiye Gir')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('btn_mesai_cik')
                .setLabel('🔴 Mesaiyi Bitir')
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: '✅ Mesai Paneli bu kanala başarıyla kuruldu.', ephemeral: true });
    }

    // --- B. /devriye-panel ---
    if (commandName === 'devriye-panel') {
        const embed = new EmbedBuilder()
            .setTitle('🚨 EMNİYET GENEL MÜDÜRLÜĞÜ - DEVRİYE KONTROL PANELİ')
            .setDescription(
                'Aşağıdaki butonları kullanarak devriye süreçlerinizi yönetebilirsiniz.\n\n' +
                '🚨 **Devriyeye Çık:** Ekip arkadaşlarınızı, aracınızı ve çağrı kodunuzu seçerek devriye başlatır.\n' +
                '🏁 **Devriyeyi Bitir:** Aktif devriyenizi sonlandırıp devriye süresini raporlar.'
            )
            .setColor('#1F618D')
            .setThumbnail(CONFIG.EGM_LOGO)
            .setFooter({ text: 'EGM Dijital Devriye Takip Sistemi', iconURL: CONFIG.EGM_LOGO })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_devriye_baslat_select')
                .setLabel('🚨 Devriyeye Çık')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('btn_devriye_bitir')
                .setLabel('🏁 Devriyeyi Bitir')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: '✅ Devriye Paneli bu kanala başarıyla kuruldu.', ephemeral: true });
    }
});

// ===================================================
// 5. INTERACTION YÖNETİMİ (BUTON, MODAL, SELECT MENU)
// ===================================================
client.on('interactionCreate', async (interaction) => {
    try {
        // --- A. MESAİYE GİR ---
        if (interaction.isButton() && interaction.customId === 'btn_mesai_gir') {
            if (aktifMesailer.has(interaction.user.id)) {
                return interaction.reply({ content: '❌ Zaten aktif bir mesainiz bulunuyor!', ephemeral: true });
            }

            aktifMesailer.set(interaction.user.id, { baslangic: Date.now() });

            const mesaiLogKanal = interaction.guild.channels.cache.get(CONFIG.MESAİ_LOG_KANAL_ID);
            if (mesaiLogKanal) {
                const embed = new EmbedBuilder()
                    .setTitle('🟢 MESAİ BAŞLADI')
                    .addFields(
                        { name: '👤 Personel', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
                        { name: '⏰ Başlangıç Saati', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    )
                    .setColor('#00FF00')
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .setTimestamp();

                await mesaiLogKanal.send({ embeds: [embed] });
            }

            return interaction.reply({ content: '✅ Mesainiz başarıyla başlatıldı.', ephemeral: true });
        }

        // --- B. MESAİYİ BİTİR ---
        if (interaction.isButton() && interaction.customId === 'btn_mesai_cik') {
            if (!aktifMesailer.has(interaction.user.id)) {
                return interaction.reply({ content: '❌ Aktif bir mesainiz bulunmamaktadır!', ephemeral: true });
            }

            const mesaiVeri = aktifMesailer.get(interaction.user.id);
            const sureGecenMs = Date.now() - mesaiVeri.baslangic;
            const dakika = Math.floor(sureGecenMs / (1000 * 60));
            const saat = Math.floor(dakika / 60);
            const kalanDakika = dakika % 60;

            aktifMesailer.delete(interaction.user.id);

            const mesaiLogKanal = interaction.guild.channels.cache.get(CONFIG.MESAİ_LOG_KANAL_ID);
            if (mesaiLogKanal) {
                const embed = new EmbedBuilder()
                    .setTitle('🔴 MESAİ BİTTİ')
                    .addFields(
                        { name: '👤 Personel', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
                        { name: '⏱️ Toplam Mesai Süresi', value: `${saat} saat ${kalanDakika} dakika`, inline: true },
                        { name: '⏰ Bitiş Saati', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                    )
                    .setColor('#FF0000')
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .setTimestamp();

                await mesaiLogKanal.send({ embeds: [embed] });
            }

            return interaction.reply({ content: `✅ Mesainiz sonlandırıldı. Toplam Süre: **${saat} saat ${kalanDakika} dakika**`, ephemeral: true });
        }

        // --- C. DEVRİYEYE ÇIK (PERSONEL SEÇİMİ) ---
        if (interaction.isButton() && interaction.customId === 'btn_devriye_baslat_select') {
            if (aktifDevriyeler.has(interaction.user.id)) {
                return interaction.reply({ content: '❌ Zaten aktif bir devriyeniz bulunuyor!', ephemeral: true });
            }

            const userSelect = new UserSelectMenuBuilder()
                .setCustomId('select_devriye_personel')
                .setPlaceholder('Devriyeye katılacak personelleri seçin...')
                .setMinValues(1)
                .setMaxValues(5);

            const row = new ActionRowBuilder().addComponents(userSelect);

            return interaction.reply({
                content: '🚨 Devriyeye katılacak personelleri seçiniz (Kendinizi de dahil edin):',
                components: [row],
                ephemeral: true
            });
        }

        // --- D. DEVRİYE PERSONEL SEÇİLDİĞİNDE MODAL AÇ ---
        if (interaction.isUserSelectMenu() && interaction.customId === 'select_devriye_personel') {
            const secilenPersoneller = interaction.values;
            devriyeTaslaklari.set(interaction.user.id, { personeller: secilenPersoneller });

            const modal = new ModalBuilder()
                .setCustomId('modal_devriye_bilgi')
                .setTitle('🚨 Devriye Bilgi Formu');

            const aracInput = new TextInputBuilder()
                .setCustomId('input_arac')
                .setLabel('Kullanılan Ekip Aracı')
                .setPlaceholder('Örn: Megane 4 / Toros / Kobra')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const kodInput = new TextInputBuilder()
                .setCustomId('input_kod')
                .setLabel('Devriye Kodu / Çağrı Kodu')
                .setPlaceholder('Örn: A-102 / Devriye Alpha')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(aracInput),
                new ActionRowBuilder().addComponents(kodInput)
            );

            return interaction.showModal(modal);
        }

        // --- E. DEVRİYE MODAL FORMU GÖNDERİLDİĞİNDE ---
        if (interaction.isModalSubmit() && interaction.customId === 'modal_devriye_bilgi') {
            const taslak = devriyeTaslaklari.get(interaction.user.id);
            if (!taslak) return interaction.reply({ content: '❌ İşlem zaman aşımına uğradı.', ephemeral: true });

            const arac = interaction.fields.getTextInputValue('input_arac');
            const kod = interaction.fields.getTextInputValue('input_kod');

            aktifDevriyeler.set(interaction.user.id, {
                baslangic: Date.now(),
                personeller: taslak.personeller,
                arac: arac,
                kod: kod
            });

            devriyeTaslaklari.delete(interaction.user.id);

            const devriyeLogKanal = interaction.guild.channels.cache.get(CONFIG.DEVRIYE_LOG_KANAL_ID);
            if (devriyeLogKanal) {
                const personelEtiketler = taslak.personeller.map(id => `<@${id}>`).join(', ');

                const embed = new EmbedBuilder()
                    .setTitle('🚨 DEVRİYE BAŞLADI')
                    .addFields(
                        { name: '🚓 Devriye Kodu', value: kod, inline: true },
                        { name: '🚘 Ekip Aracı', value: arac, inline: true },
                        { name: '👥 Katılan Personeller', value: personelEtiketler, inline: false },
                        { name: '⏰ Başlangıç Saati', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                    )
                    .setColor('#3498DB')
                    .setThumbnail(CONFIG.EGM_LOGO)
                    .setTimestamp();

                await devriyeLogKanal.send({ embeds: [embed] });
            }

            return interaction.reply({ content: `✅ **${kod}** kodlu devriye kaydı başlatıldı!`, ephemeral: true });
        }

        // --- F. DEVRİYEYİ BİTİR ---
        if (interaction.isButton() && interaction.customId === 'btn_devriye_bitir') {
            if (!aktifDevriyeler.has(interaction.user.id)) {
                return interaction.reply({ content: '❌ Adınıza kayıtlı aktif bir devriye bulunamadı!', ephemeral: true });
            }

            const devriyeVeri = aktifDevriyeler.get(interaction.user.id);
            const sureGecenMs = Date.now() - devriyeVeri.baslangic;
            const dakika = Math.floor(sureGecenMs / (1000 * 60));
            const saat = Math.floor(dakika / 60);
            const kalanDakika = dakika % 60;

            aktifDevriyeler.delete(interaction.user.id);

            const devriyeLogKanal = interaction.guild.channels.cache.get(CONFIG.DEVRIYE_LOG_KANAL_ID);
            if (devriyeLogKanal) {
                const personelEtiketler = devriyeVeri.personeller.map(id => `<@${id}>`).join(', ');

                const embed = new EmbedBuilder()
                    .setTitle('🏁 DEVRİYE BİTTİ')
                    .addFields(
                        { name: '🚓 Devriye Kodu', value: devriyeVeri.kod, inline: true },
                        { name: '🚘 Ekip Aracı', value: devriyeVeri.arac, inline: true },
                        { name: '⏱️ Toplam Devriye Süresi', value: `${saat} saat ${kalanDakika} dakika`, inline: false },
                        { name: '👥 Görevli Personeller', value: personelEtiketler, inline: false }
                    )
                    .setColor('#E74C3C')
                    .setThumbnail(CONFIG.EGM_LOGO)
                    .setTimestamp();

                await devriyeLogKanal.send({ embeds: [embed] });
            }

            return interaction.reply({ content: `✅ Devriye başarıyla sonlandırıldı. Toplam Devriye Süresi: **${saat} saat ${kalanDakika} dakika**`, ephemeral: true });
        }

    } catch (error) {
        console.error('Interaction hatası:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '⚠️ Bir işlem hatası oluştu, lütfen tekrar deneyin.', ephemeral: true });
        }
    }
});

// ===================================================
// 6. DISCORD LOGIN
// ===================================================
client.login(CONFIG.TOKEN);
