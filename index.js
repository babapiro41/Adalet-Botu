const http = require('http');
http.createServer((req, res) => res.end('Bot Aktif!')).listen(process.env.PORT || 3000);

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, ApplicationCommandOptionType } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// KOPYALADIĞIN GÜNCEL DISCORD RESİM BAĞLANTISI
const BAKANLIK_LOGO = 'https://cdn.discordapp.com/attachments/1517632919966060664/1522580425086730391/aaaa.webp?ex=6a48fd05&is=6a47ab85&hm=05a3bdabf1b8cc47174becbc39e562344f861e4a119788a35c15ac45bd6a3102&';

// MESAİ LOG KANALININ ID'Sİ
const LOG_KANAL_ID = '1522573956693889215'; 

// Verileri hafızada tutuyoruz
const aktifMesailer = new Map();
const toplamSureler = new Map();

// TÜM / KOMUTLARININ TANIMLARI
const commands = [
    {
        name: 'mesai-panel',
        description: 'Adalet Bakanlığı mesai buton panelini oluşturur. (Yönetici)',
    },
    {
        name: 'mesai-sorgu',
        description: 'Bir personelin veya kendinizin toplam mesai süresini gösterir.',
        options: [
            {
                name: 'kullanici',
                description: 'Sorgulanacak personeli seçin.',
                type: ApplicationCommandOptionType.User,
                required: false
            }
        ]
    },
    {
        name: 'mesai-top',
        description: 'En çok mesai yapan ilk 10 personeli (Sıralamayı) listeler.',
    }
];

client.once('ready', async () => {
    console.log(`${client.user.tag} aktif ve kuruluma hazır!`);

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log('Eğik çizgi (/) komutları yükleniyor...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('Eğik çizgi (/) komutları başarıyla yüklendi!');
    } catch (error) {
        console.error(error);
    }
});

// / KOMUTLARININ ÇALIŞMA MANTIĞI
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // 1. /mesai-panel KOMUTU (BÜYÜTÜLMÜŞ PANEL)
    if (commandName === 'mesai-panel') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: 'Bu komutu kullanmak için Yönetici yetkisine sahip olmalısınız.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🏛️ T.C. ADALET BAKANLIĞI MESAİ TAKİP SİSTEMİ')
            .setDescription('## 📋 PERSONEL MESAİ TALİMATI\n\nMesaiye başlarken veya mesaiyi bitirirken aşağıdaki butonları kullanmanız gerekmektedir.\n\n### ⚖️ ÖNEMLİ BİLGİLENDİRME\n* Süreleriniz sistem tarafından saniye saniye kayıt altına alınarak veri tabanına işlenmektedir.\n* Mesai başlangıç ve bitiş logları ilgili denetim kanalına anlık olarak aktarılır.\n\nİyi çalışmalar dileriz.')
            .setColor('#1a1a1a')
            .setImage(BAKANLIK_LOGO) // LOGO BURADA BÜYÜK VE KARE OLACAK
            .setFooter({ text: 'T.C. Adalet Bakanlığı Bilgi İşlem Daire Başkanlığı', iconURL: BAKANLIK_LOGO });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('mesai_baslat')
                .setLabel('▶️ MESAİYE BAŞLA')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('mesai_bitir')
                .setLabel('⏹️ MESAİYE BİTİR')
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({ content: 'Büyük panel başarıyla oluşturuluyor...', ephemeral: true });
        await interaction.channel.send({ embeds: [embed], components: [row] });
    }

    // 2. /mesai-sorgu KOMUTU (BÜYÜTÜLMÜŞ RAPOR)
    if (commandName === 'mesai-sorgu') {
        const hedef = interaction.options.getMember('kullanici') || interaction.member;
        const toplamSaniye = toplamSureler.get(hedef.id) || 0;
        
        const saat = Math.floor(toplamSaniye / 3600);
        const dakika = Math.floor((toplamSaniye % 3600) / 60);

        const sorguEmbed = new EmbedBuilder()
            .setTitle('📊 DETAYLI PERSONEL MESAİ RAPORU')
            .setDescription(`## Personel Bilgisi: ${hedef}`)
            .addFields(
                { name: '⏱️ Toplam Çalışma Süresi', value: `### \`${saat} Saat, ${dakika} Dakika\``, inline: false },
                { name: '📂 Kurum Birimi', value: 'Adalet Bakanlığı Personeli', inline: false }
            )
            .setColor('#3498db')
            .setImage(BAKANLIK_LOGO) // LOGO BURADA DA BÜYÜK
            .setTimestamp();

        return interaction.reply({ embeds: [sorguEmbed] });
    }

    // 3. /mesai-top KOMUTU (BÜYÜTÜLMÜŞ SIRALAMA)
    if (commandName === 'mesai-top') {
        if (toplamSureler.size === 0) {
            return interaction.reply({ content: 'Henüz kaydedilmiş bir mesai süresi bulunmuyor.', ephemeral: true });
        }

        const siraliListe = [...toplamSureler.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        let aciklama = "## 🏆 En Çok Mesai Yapan İlk 10 Personel\n\n";
        let sira = 1;

        for (const [userId, toplamSaniye] of siraliListe) {
            const saat = Math.floor(toplamSaniye / 3600);
            const dakika = Math.floor((toplamSaniye % 3600) / 60);
            aciklama += `### ${sira}. <@${userId}> ➔ \`${saat} Saat ${dakika} Dakika\`\n`;
            sira++;
        }

        const topEmbed = new EmbedBuilder()
            .setTitle('🏛️ ADALET BAKANLIĞI PERFORMANS SIRALAMASI')
            .setDescription(aciklama)
            .setColor('#f1c40f')
            .setImage(BAKANLIK_LOGO) // LOGO BURADA DA BÜYÜK
            .setTimestamp();

        return interaction.reply({ embeds: [topEmbed] });
    }
});

// PANELDEKİ REAKSİYON BUTONLARI VE LOG KANALINA BİLDİRİM GÖNDERME
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const logKanali = interaction.guild.channels.cache.get(LOG_KANAL_ID);
    const userId = interaction.user.id;

    if (interaction.customId === 'mesai_baslat') {
        if (aktifMesailer.has(userId)) {
            return interaction.reply({ content: '❌ Zaten aktif bir mesainiz bulunuyor!', ephemeral: true });
        }

        aktifMesailer.set(userId, Date.now());
        await interaction.reply({ content: '▶️ Mesainiz başarıyla başlatıldı. İyi çalışmalar!', ephemeral: true });

        if (logKanali) {
            const logEmbed = new EmbedBuilder()
                .setTitle('📥 MESAİ GİRİŞİ YAPILDI')
                .setDescription(`## 👤 Personel:\n${interaction.user}\n\n### 🛫 Durum:\nAktif olarak göreve ve mesaiye başlanmıştır.`)
                .setColor('#2ecc71')
                .setImage(BAKANLIK_LOGO) // LOGLARDA DA BÜYÜK FOTOĞRAF
                .setTimestamp();
            logKanali.send({ embeds: [logEmbed] });
        }
    }

    if (interaction.customId === 'mesai_bitir') {
        if (!aktifMesailer.has(userId)) {
            return interaction.reply({ content: '❌ Aktif bir mesainiz bulunuyor! Önce mesaiyi başlatmalısınız.', ephemeral: true });
        }

        const girisZamani = aktifMesailer.get(userId);
        const gecenSureSaniye = Math.floor((Date.now() - girisZamani) / 1000);

        const eskiSure = toplamSureler.get(userId) || 0;
        toplamSureler.set(userId, eskiSure + gecenSureSaniye);
        aktifMesailer.delete(userId);

        const dakika = Math.floor(gecenSureSaniye / 60);
        const saniye = gecenSureSaniye % 60;

        await interaction.reply({ content: `⏹️ Mesainiz bitirildi. Bu oturumdaki süreniz: **${dakika} dakika, ${saniye} saniye.**`, ephemeral: true });

        if (logKanali) {
            const toplamSaniye = toplamSureler.get(userId);
            const tSaat = Math.floor(toplamSaniye / 3600);
            const tDakika = Math.floor((toplamSaniye % 3600) / 60);

            const logEmbed = new EmbedBuilder()
                .setTitle('📤 MESAİ ÇIKIŞI YAPILDI')
                .setDescription(`## 👤 Personel:\n${interaction.user} mesaiyi başarıyla bitirdi.`)
                .addFields(
                    { name: '⏱️ Bu Oturumdaki Süre', value: `### \`${dakika} Dakika, ${saniye} Saniye\``, inline: false },
                    { name: '🗃️ Toplam Birikmiş Çalışma Süresi', value: `### \`${tSaat} Saat, ${tDakika} Dakika\``, inline: false }
                )
                .setColor('#e74c3c')
                .setImage(BAKANLIK_LOGO) // LOGLARDA DA BÜYÜK FOTOĞRAF
                .setTimestamp();
            logKanali.send({ embeds: [logEmbed] });
        }
    }
});

client.login(process.env.TOKEN);
