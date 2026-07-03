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

// DISCORD CDN LOGO BAĞLANTISI
const BAKANLIK_LOGO = 'https://cdn.discordapp.com/attachments/1517632919966060664/1522580425086730391/aaaa.webp?ex=6a48fd05&is=6a47ab85&hm=05a3bdabf1b8cc47174becbc39e562344f861e4a119788a35c15ac45bd6a3102&';

// AYARLAR
const LOG_KANAL_ID = '1522573956693889215'; 
const MESAİ_SORUMLUSU_ROL_ADI = 'Mesai Sorumlusu'; // Sunucundaki yetkili rol adı

// KALICI VERİ TABANI AYARI
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

// TÜRKİYE SAATİ FORMATLAYICI
function formatTRTarih(date) {
    return date.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', hour12: false }).replace(',', ' -');
}

// YETKİ KONTROL FONKSİYONU
function yetkiKontrol(interaction) {
    return interaction.member.permissions.has('Administrator') || interaction.member.roles.cache.some(role => role.name === MESAİ_SORUMLUSU_ROL_ADI);
}

// TÜM KOMUTLARIN TANIMLARI
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
    },
    {
        name: 'mesai-kapat',
        description: 'Aktif mesaisi olan bir personelin mesaisini zorla kapatır. (Mesai Sorumlusu)',
        options: [{ name: 'kullanici', description: 'Mesaisi kapatılacak personel', type: ApplicationCommandOptionType.User, required: true }]
    },
    {
        name: 'mesai-ayarla',
        description: 'Personel mesai süresini ekleme veya silme şeklinde düzenler. (Mesai Sorumlusu)',
        options: [
            {
                name: 'kullanici',
                description: 'Süresi düzenlenecek personel',
                type: ApplicationCommandOptionType.User,
                required: true
            },
            {
                name: 'islem',
                description: 'Yapılacak işlemi seçin',
                type: ApplicationCommandOptionType.String,
                required: true,
                choices: [
                    { name: 'Süre Ekle (+)', value: 'ekle' },
                    { name: 'Süre Sil (-)', value: 'sil' }
                ]
            },
            {
                name: 'saat',
                description: 'Saat miktarı',
                type: ApplicationCommandOptionType.Integer,
                required: true
            },
            {
                name: 'dakika',
                description: 'Dakika miktarı',
                type: ApplicationCommandOptionType.Integer,
                required: true
            }
        ]
    }
];

client.once('ready', async () => {
    console.log(`${client.user.tag} aktif ve kuruluma hazır!`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Komutlar başarıyla yüklendi!');
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
            .setTitle('🏛️ T.C. ADALET BAKANLIĞI MESAİ SİSTEMİ')
            .setDescription('📋 **PERSONEL MESAİ TALİMATI**\n\nMesaiye başlarken veya mesaiyi bitirirken aşağıdaki butonları kullanmanız gerekmektedir.\n\n⚠️ *Süreleriniz sistem tarafından saniye saniye kayıt altına alınarak veri tabanına işlenmektedir.*')
            .addFields({ name: '‌', value: `[‌‌ ](${BAKANLIK_LOGO})`, inline: false })
            .setColor('#1a1a1a')
            .setFooter({ text: 'T.C. Adalet Bakanlığı Bilgi İşlem Daire Başkanlığı' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('mesai_baslat').setLabel('▶️ Mesai Başlat').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('mesai_bitir').setLabel('⏹️ Mesai Bitir').setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({ content: 'Panel başarıyla oluşturuluyor...', ephemeral: true });
        await interaction.channel.send({ embeds: [embed], components: [row] });
    }

    // 2. /mesai-sorgu KOMUTU
    if (commandName === 'mesai-sorgu') {
        const hedef = interaction.options.getMember('kullanici') || interaction.member;
        const toplamSaniye = toplamSureler.get(hedef.id) || 0;
        const saat = Math.floor(toplamSaniye / 3600);
        const dakika = Math.floor((toplamSaniye % 3600) / 60);

        const sorguEmbed = new EmbedBuilder()
            .setTitle('📊 PERSONEL MESAİ RAPORU')
            .setDescription(`👤 **Personel Bilgisi:** ${hedef}\n\n⏱️ **Toplam Çalışma Süresi:** \`${saat} Saat, ${dakika} Dakika\`\n📂 **Kurum Birimi:** Adalet Bakanlığı Personeli`)
            .addFields({ name: '‌', value: `[‌‌ ](${BAKANLIK_LOGO})` })
            .setColor('#3498db')
            .setTimestamp();

        return interaction.reply({ embeds: [sorguEmbed] });
    }

    // 3. /mesai-top KOMUTU
    if (commandName === 'mesai-top') {
        if (toplamSureler.size === 0) return interaction.reply({ content: 'Henüz kaydedilmiş bir mesai süresi bulunmuyor.', ephemeral: true });

        const siraliListe = [...toplamSureler.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        let aciklama = "🏆 **En Çok Mesai Yapan İlk 10 Personel**\n\n";
        let sira = 1;

        for (const [userId, toplamSaniye] of siraliListe) {
            const saat = Math.floor(toplamSaniye / 3600);
            const dakika = Math.floor((toplamSaniye % 3600) / 60);
            aciklama += `**${sira}.** <@${userId}> ➔ \`${saat} Saat ${dakika} Dakika\`\n`;
            sira++;
        }

        const topEmbed = new EmbedBuilder()
            .setTitle('🏛️ ADALET BAKANLIĞI PERFORMANS SIRALAMASI')
            .setDescription(aciklama)
            .addFields({ name: '‌', value: `[‌‌ ](${BAKANLIK_LOGO})` })
            .setColor('#f1c40f')
            .setTimestamp();

        return interaction.reply({ embeds: [topEmbed] });
    }

    // 4. /mesai-kapat KOMUTU (Yetkili)
    if (commandName === 'mesai-kapat') {
        if (!yetkiKontrol(interaction)) return interaction.reply({ content: `❌ Bu komutu kullanmak için Yetkiniz veya **${MESAİ_SORUMLUSU_ROL_ADI}** rolünüz bulunmalıdır.`, ephemeral: true });

        const hedef = interaction.options.getUser('kullanici');
        if (!aktifMesailer.has(hedef.id)) return interaction.reply({ content: '❌ Belirtilen personelin şu anda aktif bir mesaisi bulunmuyor.', ephemeral: true });

        const girisZamani = aktifMesailer.get(hedef.id);
        const gecenSureSaniye = Math.floor((Date.now() - girisZamani) / 1000);
        const eskiSure = toplamSureler.get(hedef.id) || 0;
        const yeniToplam = eskiSure + gecenSureSaniye;

        toplamSureler.set(hedef.id, yeniToplam);
        veriKaydet();
        aktifMesailer.delete(hedef.id);

        const logKanali = interaction.guild.channels.cache.get(LOG_KANAL_ID);
        interaction.reply({ content: `✅ ${hedef} isimli personelin aktif mesaisi yetkili tarafından başarıyla sonlandırıldı.`, ephemeral: true });

        if (logKanali) {
            const tSaat = Math.floor(yeniToplam / 3600);
            const tDakika = Math.floor((yeniToplam % 3600) / 60);
            const logEmbed = new EmbedBuilder()
                .setTitle('🚨 MESAİ YETKİLİ TARAFINDAN KAPATILDI')
                .setDescription(`👤 **Personel:** ${hedef}\n🛡️ **Kapatan Yetkili:** ${interaction.user}\n\n⏱️ **Kazanılan Süre:** \`${Math.floor(gecenSureSaniye / 60)} Dakika\`\n🗃️ **Güncel Toplam Süre:** \`${tSaat} Saat, ${tDakika} Dakika\``)
                .addFields({ name: '‌', value: `[‌‌ ](${BAKANLIK_LOGO})` })
                .setColor('#d35400')
                .setTimestamp();
            logKanali.send({ embeds: [logEmbed] });
        }
    }

    // 5. /mesai-ayarla KOMUTU (Ekleme ve Silme Birleştirildi)
    if (commandName === 'mesai-ayarla') {
        if (!yetkiKontrol(interaction)) return interaction.reply({ content: `❌ Bu komutu kullanmak için Yetkiniz veya **${MESAİ_SORUMLUSU_ROL_ADI}** rolünüz bulunmalıdır.`, ephemeral: true });

        const hedef = interaction.options.getUser('kullanici');
        const islem = interaction.options.getString('islem');
        const saat = interaction.options.getInteger('saat');
        const dakika = interaction.options.getInteger('dakika');

        const degisimSaniyesi = (saat * 3600) + (dakika * 60);
        const mevcutSure = toplamSureler.get(hedef.id) || 0;
        
        let yeniToplam = mevcutSure;
        let logBaslik = "";
        let logRenk = "";
        let logAciklama = "";

        if (islem === 'ekle') {
            yeniToplam = mevcutSure + degisimSaniyesi;
            logBaslik = '➕ MANUEL MESAİ SÜRESİ EKLENDİ';
            logRenk = '#27ae60';
            logAciklama = `➕ **Eklenen Süre:** \`${saat} Saat, ${dakika} Dakika\``;
            interaction.reply({ content: `✅ ${hedef} personeline başarıyla \`${saat} saat, ${dakika} dakika\` süre eklendi.`, ephemeral: true });
        } else if (islem === 'sil') {
            yeniToplam = mevcutSure - degisimSaniyesi;
            if (yeniToplam < 0) yeniToplam = 0; // Süre eksiye düşmesin
            logBaslik = '➖ MANUEL MESAİ SÜRESİ SİLİNDİ';
            logRenk = '#c0392b';
            logAciklama = `➖ **Silinen Süre:** \`${saat} Saat, ${dakika} Dakika\``;
            interaction.reply({ content: `✅ ${hedef} personelinin mesai süresinden başarıyla \`${saat} saat, ${dakika} dakika\` silindi.`, ephemeral: true });
        }

        toplamSureler.set(hedef.id, yeniToplam);
        veriKaydet();

        const logKanali = interaction.guild.channels.cache.get(LOG_KANAL_ID);
        if (logKanali) {
            const tSaat = Math.floor(yeniToplam / 3600);
            const tDakika = Math.floor((yeniToplam % 3600) / 60);
            const logEmbed = new EmbedBuilder()
                .setTitle(logBaslik)
                .setDescription(`👤 **Personel:** ${hedef}\n🛡️ **İşlemi Yapan:** ${interaction.user}\n\n${logAciklama}\n🗃️ **Yeni Toplam Süre:** \`${tSaat} Saat, ${tDakika} Dakika\``)
                .addFields({ name: '‌', value: `[‌‌ ](${BAKANLIK_LOGO})` })
                .setColor(logRenk)
                .setTimestamp();
            logKanali.send({ embeds: [logEmbed] });
        }
    }
});

// BUTON REAKSİYONLARI VE LOGLAMA
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const logKanali = interaction.guild.channels.cache.get(LOG_KANAL_ID);
    const userId = interaction.user.id;

    if (interaction.customId === 'mesai_baslat') {
        if (aktifMesailer.has(userId)) return interaction.reply({ content: '❌ Zaten aktif bir mesainiz bulunuyor!', ephemeral: true });

        const simdi = Date.now();
        aktifMesailer.set(userId, simdi);
        await interaction.reply({ content: '▶️ Mesainiz başarıyla başlatıldı. İyi çalışmalar!', ephemeral: true });

        if (logKanali) {
            const mevcutToplamSaniye = toplamSureler.get(userId) || 0;
            const mSaat = Math.floor(mevcutToplamSaniye / 3600);
            const mDakika = Math.floor((mevcutToplamSaniye % 3600) / 60);

            const logEmbed = new EmbedBuilder()
                .setTitle('📥 MESAİ GİRİŞİ YAPILDI')
                .setDescription(`👤 **Personel:** ${interaction.user}\n\n📅 **Giriş Saati:** \`${formatTRTarih(new Date(simdi))}\`\n🗃️ **Mevcut Toplam Mesai:** \`${mSaat} Saat, ${mDakika} Dakika\``)
                .addFields({ name: '‌', value: `[‌‌ ](${BAKANLIK_LOGO})` })
                .setColor('#2ecc71')
                .setTimestamp();
            logKanali.send({ embeds: [logEmbed] });
        }
    }

    if (interaction.customId === 'mesai_bitir') {
        if (!aktifMesailer.has(userId)) return interaction.reply({ content: '❌ Aktif bir mesainiz bulunmuyor! Önce mesaiyi başlatmalısınız.', ephemeral: true });

        const girisZamani = aktifMesailer.get(userId);
        const gecenSureSaniye = Math.floor((Date.now() - girisZamani) / 1000);
        const eskiSure = toplamSureler.get(userId) || 0;
        const yeniToplam = eskiSure + gecenSureSaniye;
        
        toplamSureler.set(userId, yeniToplam);
        veriKaydet(); 
        aktifMesailer.delete(userId);

        const dakika = Math.floor(gecenSureSaniye / 60);
        const saniye = gecenSureSaniye % 60;

        await interaction.reply({ content: `⏹️ Mesainiz bitirildi. Bu oturumdaki süreniz: **${dakika} dakika, ${saniye} saniye.**`, ephemeral: true });

        if (logKanali) {
            const tSaat = Math.floor(yeniToplam / 3600);
            const tDakika = Math.floor((yeniToplam % 3600) / 60);

            const logEmbed = new EmbedBuilder()
                .setTitle('📤 MESAİ ÇIŞI YAPILDI')
                .setDescription(`👤 **Personel:** ${interaction.user}\n\n⏱️ **Bu Oturumdaki Süre:** \`${dakika} Dakika, ${saniye} Saniye\`\n🗃️ **Güncel Toplam Süre:** \`${tSaat} Saat, ${tDakika} Dakika\``)
                .addFields({ name: '‌', value: `[‌‌ ](${BAKANLIK_LOGO})` })
                .setColor('#e74c3c')
                .setTimestamp();
            logKanali.send({ embeds: [logEmbed] });
        }
    }
});

client.login(process.env.TOKEN);
