const http = require('http');
http.createServer((req, res) => res.end('Bot Aktif!')).listen(process.env.PORT || 3000);

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, ApplicationCommandOptionType } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// DOĞRUDAN RESİM BAĞLANTINIZ
const BAKANLIK_LOGO = 'https://cdn.discordapp.com/attachments/1517632919966060664/1522580425086730391/aaaa.webp?ex=6a48fd05&is=6a47ab85&hm=05a3bdabf1b8cc47174becbc39e562344f861e4a119788a35c15ac45bd6a3102&';

// MESAİ LOG KANALININ ID'Sİ
const LOG_KANAL_ID = '1522573956693889215'; 

// KALICI VERİ TABANI AYARI (Render kapansa da silinmez)
const DATA_FILE = path.join(__dirname, 'toplamSureler.json');
let toplamSureler = new Map();

if (fs.existsSync(DATA_FILE)) {
    try {
        const rawData = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(rawData);
        toplamSureler = new Map(Object.entries(parsed));
    } catch (e) {
        console.error("Veri tabanı okuma hatası:", e);
    }
}

function veriKaydet() {
    const obj = Object.fromEntries(toplamSureler);
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

const aktifMesailer = new Map();

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

    // 1. /mesai-panel KOMUTU (FOTOĞRAF EN ÜSTTE HİLESİ YAPILDI)
    if (commandName === 'mesai-panel') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: 'Bu komutu kullanmak için Yönetici yetkisine sahip olmalısınız.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🏛️ T.C. ADALET BAKANLIĞI MESAİ SİSTEMİ')
            .setImage(BAKANLIK_LOGO) // Büyük fotoğraf en üstte dursun diye yazıyı alt bilgiye itiyoruz
            .setDescription('### 📋 PERSONEL MESAİ TALİMATI\nMesaiye başlarken veya mesaiyi bitirirken aşağıdaki butonları kullanmanız gerekmektedir.\n\n*Not: Süreleriniz sistem tarafından kalıcı olarak saniye saniye kayıt altına alınmaktadır.*')
            .setColor('#1a1a1a')
            .setFooter({ text: 'T.C. Adalet Bakanlığı Bilgi İşlem Daire Başkanlığı', iconURL: BAKANLIK_LOGO });

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

        await interaction.reply({ content: 'Büyük panel başarıyla oluşturuluyor...', ephemeral: true });
        await interaction.channel.send({ embeds: [embed], components: [row] });
    }

    // 2. /mesai-sorgu KOMUTU
    if (commandName === 'mesai-sorgu') {
        const hedef = interaction.options.getMember('kullanici') || interaction.member;
        const toplamSaniye = toplamSureler.get(hedef.id) || 0;
        
        const saat = Math.floor(toplamSaniye / 3600);
        const dakika = Math.floor((toplamSaniye % 3600) / 60);

        const sorguEmbed = new EmbedBuilder()
            .setTitle('📊 DETAYLI PERSONEL MESAİ RAPORU')
            .setImage(BAKANLIK_LOGO)
            .setDescription(`## Personel Bilgisi: ${hedef}\n\n⏱️ **Toplam Çalışma Süresi:** \`${saat} Saat, ${dakika} Dakika\`\n📂 **Kurum Birimi:** Adalet Bakanlığı Personeli`)
            .setColor('#3498db')
            .setTimestamp();

        return interaction.reply({ embeds: [sorguEmbed] });
    }

    // 3. /mesai-top KOMUTU
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
            .setImage(BAKANLIK_LOGO)
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
                .setTitle('📥 MESAİ GİRİŞİ YAPILDI')
                .setImage(BAKANLIK_LOGO)
                .setDescription(`## 👤 Personel:\n${interaction.user}\n\n### 🛫 Durum:\nAktif olarak göreve ve mesaiye başlanmıştır.`)
                .setColor('#2ecc71')
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
        const yeniToplam = eskiSure + gecenSureSaniye;
        
        toplamSureler.set(userId, yeniToplam);
        veriKaydet(); // Dosyaya kalıcı olarak yazar
        
        aktifMesailer.delete(userId);

        const dakika = Math.floor(gecenSureSaniye / 60);
        const saniye = gecenSureSaniye % 60;

        await interaction.reply({ content: `⏹️ Mesainiz bitirildi. Bu oturumdaki süreniz: **${dakika} dakika, ${saniye} saniye.**`, ephemeral: true });

        if (logKanali) {
            const tSaat = Math.floor(yeniToplam / 3600);
            const tDakika = Math.floor((yeniToplam % 3600) / 60);

            const logEmbed = new EmbedBuilder()
                .setTitle('📤 MESAİ ÇIŞI YAPILDI')
                .setImage(BAKANLIK_LOGO)
                .setDescription(`## 👤 Personel:\n${interaction.user} mesaiyi başarıyla bitirdi.\n\n⏱️ **Bu Oturumdaki Süre:** \`${dakika} Dakika, ${saniye} Saniye\`\n🗃️ **Kalıcı Toplam Süre:** \`${tSaat} Saat, ${tDakika} Dakika\``)
                .setColor('#e74c3c')
                .setTimestamp();
            logKanali.send({ embeds: [logEmbed] });
        }
    }
});

client.login(process.env.TOKEN);
