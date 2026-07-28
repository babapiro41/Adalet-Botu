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
    Partials
} = require('discord.js');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel, Partials.Message]
});

// ==========================================
// CONFIGURASYON & KANAL ID'LERİ
// ==========================================
const CONFIG = {
    MESAİ_LOG_KANAL_ID: '1531433468754530514',     // Mesai giriş/çıkış log kanalı
    DEVRIYE_LOG_KANAL_ID: '1531466878713593987', // Devriye başlangıç/bitiş log kanalı
    EGM_LOGO: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/EGM_Logo.png/800px-EGM_Logo.png', // EGM Logosu
    TOKEN: process.env.TOKEN
};
};

// ==========================================
// HAREKETLİ HAFIZA (VERİ DEPOLAMA)
// ==========================================
const aktifMesailer = new Map();   // UserId -> { baslangic }
const aktifDevriyeler = new Map(); // UserId -> { baslangic, memurlar: [], arac, kod }
const devriyeGecmisi = [];        // { userId, sureDakika, tarih }
const mesaiGecmisi = [];          // { userId, sureDakika, tarih }

client.once('ready', () => {
    console.log(`🚨 EGM Mesai ve Devriye Botu (${client.user.tag}) Aktif!`);
});

// ==========================================
// 1. ANA PANEL KURULUM KOMUTU (/panel-kur)
// ==========================================
client.on('messageCreate', async message => {
    if (message.content === '!panel-kur' && message.member.permissions.has('Administrator')) {
        
        const panelEmbed = new EmbedBuilder()
            .setColor('#002B66')
            .setTitle('🚨 EGM MESAI VE DEVRİYE YÖNETİM PANELSİ')
            .setDescription(
                'Aşağıdaki butonları kullanarak mesaiye girebilir, devriye görevi başlatabilir veya istatistiklerinizi görüntüleyebilirsiniz.\n\n' +
                '📌 **Mesai:** Bireysel çalışma sürenizi kaydeder.\n' +
                '🚔 **Devriye:** Ekibiniz, devriye aracınız ve devriye kodunuz ile görev başlatır.'
            )
            .setThumbnail(CONFIG.EGM_LOGO)
            .setFooter({ text: 'Emniyet Genel Müdürlüğü - Personel Takip Sistemi' });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('mesai_basla_btn')
                .setLabel('🟢 Mesai Başlat')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('mesai_bitir_btn')
                .setLabel('🔴 Mesai Bitir')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('devriye_basla_btn')
                .setLabel('🚨 Devriyeye Çık')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('devriye_bitir_btn')
                .setLabel('🏁 Devriye Bitir')
                .setStyle(ButtonStyle.Secondary)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('istatistik_btn')
                .setLabel('📊 İstatistiklerim')
                .setStyle(ButtonStyle.Secondary)
        );

        await message.channel.send({ embeds: [panelEmbed], components: [row1, row2] });
        message.delete().catch(() => {});
    }
});

// ==========================================
// 2. ETKİLEŞİM VE BUTON MANTIĞI
// ==========================================
client.on('interactionCreate', async interaction => {

    // --- A) MESAİ İŞLEMLERİ ---
    if (interaction.isButton()) {
        const userId = interaction.user.id;

        // 1. MESAİ BAŞLAT
        if (interaction.customId === 'mesai_basla_btn') {
            if (aktifMesailer.has(userId)) {
                return interaction.reply({ content: '⚠️ Zaten aktif bir mesainiz bulunuyor!', ephemeral: true });
            }

            const baslangic = new Date();
            aktifMesailer.set(userId, { baslangic });

            const logEmbed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('🟢 MESAİ BAŞLADI')
                .setThumbnail(CONFIG.EGM_LOGO)
                .addFields(
                    { name: '👮‍♂️ Memur', value: `<@${userId}>`, inline: true },
                    { name: '🕒 Başlangıç Saati', value: `<t:${Math.floor(baslangic.getTime() / 1000)}:F>`, inline: false }
                )
                .setTimestamp();

            const logKanal = interaction.guild.channels.cache.get(CONFIG.MESAİ_LOG_KANAL_ID);
            if (logKanal) logKanal.send({ embeds: [logEmbed] });

            return interaction.reply({ content: '✅ Mesainiz başarıyla başlatıldı.', ephemeral: true });
        }

        // 2. MESAİ BİTİR
        if (interaction.customId === 'mesai_bitir_btn') {
            if (!aktifMesailer.has(userId)) {
                return interaction.reply({ content: '⚠️ Aktif bir mesai kaydınız bulunmuyor.', ephemeral: true });
            }

            const mesai = aktifMesailer.get(userId);
            const bitis = new Date();
            const farkMs = bitis - mesai.baslangic;
            const toplamDk = Math.floor(farkMs / (1000 * 60));
            const saat = Math.floor(toplamDk / 60);
            const dk = toplamDk % 60;
            const sureMetni = `${saat} Saat ${dk} Dakika`;

            mesaiGecmisi.push({ userId, sureDakika: toplamDk, tarih: bitis });
            aktifMesailer.delete(userId);

            const logEmbed = new EmbedBuilder()
                .setColor('#E74C3C')
                .setTitle('🔴 MESAİ BİTTİ')
                .setThumbnail(CONFIG.EGM_LOGO)
                .addFields(
                    { name: '👮‍♂️ Memur', value: `<@${userId}>`, inline: true },
                    { name: '⏳ Toplam Süre', value: `**${sureMetni}**`, inline: true },
                    { name: '🕒 Bitiş Saati', value: `<t:${Math.floor(bitis.getTime() / 1000)}:F>`, inline: false }
                )
                .setTimestamp();

            const logKanal = interaction.guild.channels.cache.get(CONFIG.MESAİ_LOG_KANAL_ID);
            if (logKanal) logKanal.send({ embeds: [logEmbed] });

            return interaction.reply({ content: `🏁 Mesainiz kapatıldı. Toplam Süre: **${sureMetni}**`, ephemeral: true });
        }

        // --- B) DEVRİYE İŞLEMLERİ ---

        // 1. DEVRİYEYE ÇIK (MEMUR SEÇİMİ)
        if (interaction.customId === 'devriye_basla_btn') {
            if (aktifDevriyeler.has(userId)) {
                return interaction.reply({ content: '⚠️ Zaten devam eden bir devriyeniz var!', ephemeral: true });
            }

            const userSelect = new UserSelectMenuBuilder()
                .setCustomId('devriye_memur_secimi')
                .setPlaceholder('Devriyeye çıkan tüm memurları seçin...')
                .setMinValues(1)
                .setMaxValues(5);

            const row = new ActionRowBuilder().addComponents(userSelect);

            return interaction.reply({
                content: '👥 **Adım 1/2:** Lütfen kendiniz dahil devriyeye katılan tüm memurları listeden işaretleyin:',
                components: [row],
                ephemeral: true
            });
        }

        // 2. DEVRİYE BİTİR
        if (interaction.customId === 'devriye_bitir_btn') {
            if (!aktifDevriyeler.has(userId)) {
                return interaction.reply({ content: '⚠️ Aktif bir devriye kaydınız bulunmuyor.', ephemeral: true });
            }

            const devriye = aktifDevriyeler.get(userId);
            const bitis = new Date();
            const farkMs = bitis - devriye.baslangic;
            const toplamDk = Math.floor(farkMs / (1000 * 60));
            const saat = Math.floor(toplamDk / 60);
            const dk = toplamDk % 60;
            const sureMetni = `${saat} Saat ${dk} Dk`;

            // Devriyedeki TÜM memurların istatistiğine işle
            devriye.memurlar.forEach(mId => {
                devriyeGecmisi.push({ userId: mId, sureDakika: toplamDk, tarih: bitis });
            });

            const logEmbed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('🏁 EGM DEVRİYE TAMAMLANDI')
                .setThumbnail(CONFIG.EGM_LOGO)
                .addFields(
                    { name: '👮‍♂️ Devriye Lideri', value: `<@${userId}>`, inline: true },
                    { name: '👥 Devriye Ekibi', value: devriye.memurlar.map(id => `<@${id}>`).join(', '), inline: false },
                    { name: '📻 Devriye Kodu', value: `\`${devriye.kod}\``, inline: true },
                    { name: '🚘 Araç Marka/Model', value: `\`${devriye.arac}\``, inline: true },
                    { name: '⏳ Toplam Devriye Süresi', value: `**${sureMetni}**`, inline: false }
                )
                .setFooter({ text: 'EGM Devriye Sistemleri' })
                .setTimestamp();

            const logKanal = interaction.guild.channels.cache.get(CONFIG.DEVRIYE_LOG_KANAL_ID);
            if (logKanal) logKanal.send({ embeds: [logEmbed] });

            aktifDevriyeler.delete(userId);
            return interaction.reply({ content: `🏁 Devriye kapatıldı. Toplam Görev Süresi: **${sureMetni}**`, ephemeral: true });
        }

        // 3. İSTATİSTİK SORGULA
        if (interaction.customId === 'istatistik_btn') {
            const userDevriyeleri = devriyeGecmisi.filter(d => d.userId === userId);
            const userMesaileri = mesaiGecmisi.filter(m => m.userId === userId);

            // Devriye Hesap
            const devriyeSayisi = userDevriyeleri.length;
            const devriyeToplamDk = userDevriyeleri.reduce((a, b) => a + b.sureDakika, 0);
            const dSaat = Math.floor(devriyeToplamDk / 60);
            const dDk = devriyeToplamDk % 60;

            // Mesai Hesap
            const mesaiSayisi = userMesaileri.length;
            const mesaiToplamDk = userMesaileri.reduce((a, b) => a + b.sureDakika, 0);
            const mSaat = Math.floor(mesaiToplamDk / 60);
            const mDk = mesaiToplamDk % 60;

            const statEmbed = new EmbedBuilder()
                .setColor('#F1C40F')
                .setTitle(`📊 Personel Görev İstatistikleri`)
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    { name: '👮‍♂️ Memur', value: `<@${userId}>`, inline: false },
                    { name: '🚨 Devriye Sayısı', value: `\`${devriyeSayisi} Kez\``, inline: true },
                    { name: '⏱️ Toplam Devriye Süresi', value: `\`${dSaat} Saat ${dDk} Dk\``, inline: true },
                    { name: '🟢 Mesai Giriş Sayısı', value: `\`${mesaiSayisi} Kez\``, inline: true },
                    { name: '⏱️ Toplam Mesai Süresi', value: `\`${mSaat} Saat ${mDk} Dk\``, inline: true }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [statEmbed], ephemeral: true });
        }
    }

    // --- C) KULLANICI SEÇİM MENÜSÜ -> FORM AÇMA ---
    if (interaction.isUserSelectMenu() && interaction.customId === 'devriye_memur_secimi') {
        const secilenMemurlar = interaction.values;

        const modal = new ModalBuilder()
            .setCustomId(`devriye_modal_${secilenMemurlar.join('_')}`)
            .setTitle('🚨 Adım 2/2: Devriye Detayları');

        const aracInput = new TextInputBuilder()
            .setCustomId('arac_model')
            .setLabel('Devriye Aracı Marka / Model')
            .setPlaceholder('Örn: Ford Transit / Megane 4')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const kodInput = new TextInputBuilder()
            .setCustomId('devriye_kodu')
            .setLabel('Devriye Birimi ve Kodu')
            .setPlaceholder('Örn: A Asayiş 3 / A3')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(aracInput),
            new ActionRowBuilder().addComponents(kodInput)
        );

        await interaction.showModal(modal);
    }

    // --- D) DEVRİYE MODAL FORMU ONAYLANDIĞINDA ---
    if (interaction.isModalSubmit() && interaction.customId.startsWith('devriye_modal_')) {
        const memurIds = interaction.customId.replace('devriye_modal_', '').split('_');
        const arac = interaction.fields.getTextInputValue('arac_model');
        const kod = interaction.fields.getTextInputValue('devriye_kodu');
        const baslangic = new Date();

        // Devriye Kaydı
        aktifDevriyeler.set(interaction.user.id, {
            baslangic,
            memurlar: memurIds,
            arac,
            kod
        });

        const logEmbed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('🚨 EGM DEVRİYE BAŞLADI')
            .setThumbnail(CONFIG.EGM_LOGO)
            .addFields(
                { name: '👮‍♂️ Devriye Lideri', value: `<@${interaction.user.id}>`, inline: true },
                { name: '👥 Devriye Ekibi', value: memurIds.map(id => `<@${id}>`).join(', '), inline: false },
                { name: '🚘 Araç Marka/Model', value: `\`${arac}\``, inline: true },
                { name: '📻 Devriye Kodu', value: `\`${kod}\``, inline: true },
                { name: '🕒 Başlangıç Saati', value: `<t:${Math.floor(baslangic.getTime() / 1000)}:F>`, inline: false }
            )
            .setFooter({ text: 'EGM Devriye Takip Sistemi' })
            .setTimestamp();

        const logKanal = interaction.guild.channels.cache.get(CONFIG.DEVRIYE_LOG_KANAL_ID);
        if (logKanal) logKanal.send({ embeds: [logEmbed] });

        return interaction.reply({ content: `✅ Devriye göreviniz başlatıldı! **KOD:** ${kod}`, ephemeral: true });
    }
});

client.login(CONFIG.TOKEN);
