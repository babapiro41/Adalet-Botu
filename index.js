const http = require('http');
http.createServer((req, res) => res.end('Bot Aktif!')).listen(process.env.PORT || 3000);

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, ApplicationCommandOptionType } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// BURAYA MESAİ LOG KANALININ ID'SİNİ YAZIN
const LOG_KANAL_ID = '122573956693889215'; 

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

    // 1. /mesai-panel KOMUTU
    if (commandName === 'mesai-panel') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: 'Bu komutu kullanmak için Yönetici yetkisine sahip olmalısınız.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🏛️ ADALET BAKANLIĞI MESAİ SİSTEMİ')
            .setDescription('Mesaiye başlarken veya mesaiyi bitirirken aşağıdaki butonları kullanınız.\n\n*Not: Süreleriniz saniye saniye kayıt altına alınmaktadır.*')
            .setColor('#1a1a1a')
            .setFooter({ text: 'Adalet Bakanlığı Bilgi İşlem' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('mesai_baslat')
                .setLabel('▶️ Mesai Başlat')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('mesai_bitir')
                .setLabel('⏹️ Mesai Bitir')
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({ content: 'Panel başarıyla oluşturuluyor...', ephemeral: true });
        await interaction.channel.send({ embeds: [embed], components: [row] });
    }

    // 2. /mesai-sorgu KOMUTU (MESAİ KONTROLÜ)
    if (commandName === 'mesai-sorgu') {
        const hedef = interaction.options.getMember('kullanici') || interaction.member;
        const toplamSaniye = toplamSureler.get(hedef.id) || 0;
        
        const saat = Math.floor(toplamSaniye / 3600);
        const dakika = Math.floor((toplamSaniye % 3600) / 60);

        const sorguEmbed = new EmbedBuilder()
            .setTitle('📊 Personel Mesai Raporu')
            .setDescription(`${hedef} adlı personelin toplam mesai süresi:\n\n**⏱️ ${saat} Saat, ${dakika} Dakika**`)
            .setColor('#3498db')
            .setTimestamp();

        return interaction.reply({ embeds: [sorguEmbed] });
    }

    // 3. /mesai-top KOMUTU (SIRALAMA TABLOSU)
    if (commandName === 'mesai-top') {
        if (toplamSureler.size === 0) {
            return interaction.reply({ content: 'Henüz kaydedilmiş bir mesai süresi bulunmuyor.', ephemeral: true });
        }

        const siraliListe = [...toplamSureler.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        let aciklama = "";
        let sira = 1;

        for (const [userId, toplamSaniye] of siraliListe) {
            const saat = Math.floor(toplamSaniye / 3600);
            const dakika = Math.floor((toplamSaniye % 3600) / 60);
            aciklama += `**${sira}.** <@${userId}> ➔ \`${saat}s ${dakika}dk\`\n`;
            sira++;
        }

        const topEmbed = new EmbedBuilder()
            .setTitle('🏆 En Çok Mesai Yapan Personeller (Top 10)')
            .setDescription(aciklama)
            .setColor('#f1c40f')
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
                .setTitle('📥 Mesai Girişi')
                .setDescription(`${interaction.user} mesaiye başladı.`)
                .setColor('#2ecc71')
                .setTimestamp();
            logKanali.send({ embeds: [logEmbed] });
        }
    }

    if (interaction.customId === 'mesai_bitir') {
        if (!aktifMesailer.has(userId)) {
            return interaction.reply({ content: '❌ Aktif bir mesainiz bulunmuyor! Önce mesaiyi başlatmalısınız.', ephemeral: true });
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
                .setTitle('📤 Mesai Çıkışı')
                .setDescription(`${interaction.user} mesaiyi bitirdi.\n\n**Bu oturum:** ${dakika} dk, ${saniye} sn\n**Toplam Çalışma Süresi:** ${tSaat} saat, ${tDakika} dk`)
                .setColor('#e74c3c')
                .setTimestamp();
            logKanali.send({ embeds: [logEmbed] });
        }
    }
});

client.login(process.env.TOKEN);
