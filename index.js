const http = require('http');
http.createServer((req, res) => res.end('Bot Aktif!')).listen(process.env.PORT || 3000);

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, ApplicationCommandOptionType } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// CONFIG AYARLARI
const BAKANLIK_LOGO = 'https://cdn.discordapp.com/attachments/1517632919966060664/1522580425086730391/aaaa.webp?ex=6a48fd05&is=6a47ab85&hm=05a3bdabf1b8cc47174becbc39e562344f861e4a119788a35c15ac45bd6a3102&';
const LOG_KANAL_ID = '1522573956693889215'; 
const MESAİ_SORUMLUSU_ROL_ADI = 'Mesai Sorumlusu'; 

// VERİ YAPILARI
let toplamSureler = new Map();
let mesaiGirisSayilari = new Map();
let sonGirisTarihleri = new Map();
let mesaiBaslangicTarihleri = new Map(); 
const aktifMesailer = new Map();

// VERİLERİ DISCORD LOG KANALINA YEDEKLER
async function veriKaydet(guild) {
    const logKanali = guild.channels.cache.get(LOG_KANAL_ID);
    if (!logKanali) return;

    const dataObj = {
        sureler: Object.fromEntries(toplamSureler),
        girisler: Object.fromEntries(mesaiGirisSayilari),
        tarihler: Object.fromEntries(sonGirisTarihleri),
        baslangiclar: Object.fromEntries(mesaiBaslangicTarihleri)
    };
    
    const sifredat = Buffer.from(JSON.stringify(dataObj)).toString('base64');
    await logKanali.send({ content: `DATA_BACKUP:${sifredat}` });
}

// BOT AÇILDIĞINDA EN SON DISCORD YEDEĞİNİ GERİ YÜKLER
async function veriYukle(guild) {
    const logKanali = guild.channels.cache.get(LOG_KANAL_ID);
    if (!logKanali) return;

    try {
        const mesajlar = await logKanali.messages.fetch({ limit: 50 });
        const yedekMesaji = mesajlar.find(m => m.content.startsWith('DATA_BACKUP:'));
        
        if (yedekMesaji) {
            const base64Data = yedekMesaji.content.replace('DATA_BACKUP:', '');
            const rawData = Buffer.from(base64Data, 'base64').toString('utf-8');
            const parsed = JSON.parse(rawData);
            
            if (parsed.sureler) toplamSureler = new Map(Object.entries(parsed.sureler));
            if (parsed.girisler) mesaiGirisSayilari = new Map(Object.entries(parsed.girisler));
            if (parsed.tarihler) sonGirisTarihleri = new Map(Object.entries(parsed.tarihler));
            if (parsed.baslangiclar) mesaiBaslangicTarihleri = new Map(Object.entries(parsed.baslangiclar));
            
            console.log("Mesai verileri ve liderlik tablosu başarıyla geri yüklendi!");
        } else {
            console.log("Eski bir mesai yedeği bulunamadı, sıfırdan başlanıyor.");
        }
    } catch (e) {
        console.error("Yedek yükleme hatası:", e);
    }
}

function formatTRTarih(date) {
    return date.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', hour12: false }).replace(',', ' -');
}

function yetkiKontrol(interaction) {
    return interaction.member.permissions.has('Administrator') || interaction.member.roles.cache.some(role => role.name === MESAİ_SORUMLUSU_ROL_ADI);
}

// Günlük ortalama saniyeyi hesaplayan yardımcı fonksiyon
function hesaplaGunlukOrtalamaSaniye(userId, toplamSaniye) {
    const ilkKayitMs = mesaiBaslangicTarihleri.get(userId);
    if (!ilkKayitMs || toplamSaniye <= 0) return 0;
    const gecenSureMs = Date.now() - Number(ilkKayitMs);
    const gecenGunSayisi = Math.max(1, Math.ceil(gecenSureMs / (1000 * 60 * 60 * 24)));
    return Math.floor(toplamSaniye / gecenGunSayisi);
}

const commands = [
    {
        name: 'mesai-panel',
        description: 'Adalet Bakanlığı mesai buton panelini oluşturur. (Yönetici)',
    },
    {
        name: 'mesai-sorgu',
        description: 'Bir personelin detaylı mesai profilini gösterir. (Mesai Sorumlusu)',
        options: [{ name: 'kullanici', description: 'Sorgulanacak personeli seçin.', type: ApplicationCommandOptionType.User, required: true }]
    },
    {
        name: 'mesai-top',
        description: 'En çok mesai yapan ilk 10 personeli listeler (Günlük ortalama bilgisiyle).',
    },
    {
        name: 'aktif-mesai',
        description: 'Şu anda aktif olarak mesaide olan tüm personelleri listeler.',
    },
    {
        name: 'mesai-kapat',
        description: 'Aktif mesaisi olan bir personelin mesaisini zorla kapatır. (Mesai Sorumlusu)',
        options: [{ name: 'kullanici', description: 'Mesaisi kapatılacak personel', type: ApplicationCommandOptionType.User, required: true }]
    },
    {
        name: 'toplu-mesai-kapat',
        description: 'Şu anda aktif mesaide olan HERKESİN mesaisini toplu olarak kapatır. (Mesai Sorumlusu)',
    },
    {
        name: 'mesai-ayarla',
        description: 'Personel mesai süresini ekleme veya silme şeklinde düzenler. (Mesai Sorumlusu)',
        options: [
            { name: 'kullanici', description: 'Süresi düzenlenecek personel', type: ApplicationCommandOptionType.User, required: true },
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
            { name: 'saat', description: 'Saat miktarı', type: ApplicationCommandOptionType.Integer, required: true },
            { name: 'dakika', description: 'Dakika miktarı', type: ApplicationCommandOptionType.Integer, required: true }
        ]
    }
];

client.once('ready', async () => {
    console.log(`${client.user.tag} aktif!`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        const ilkGuild = client.guilds.cache.first();
        if (ilkGuild) await veriYukle(ilkGuild);
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    if (commandName === 'mesai-panel') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: 'Bu komutu kullanmak için Yönetici yetkisine sahip olmalısınız.', ephemeral: true });
        }
        const embed = new EmbedBuilder()
            .setTitle('🏛️ T.C. ADALET BAKANLIĞI MESAİ SİSTEMİ')
            .setDescription('📋 **PERSONEL MESAİ TALİMATI**\n\nMesaiye başlarken veya mesaiyi bitirirken aşağıdaki butonları kullanmanız gerekmektedir.\n\n⚠️ *Süreleriniz sistem tarafından saniye saniye kayıt altına alınarak veri tabanına işlenmektedir.*')
            .setThumbnail(BAKANLIK_LOGO)
            .setColor('#1a1a1a')
            .setFooter({ text: 'T.C. Adalet Bakanlığı Bilgi İşlem Daire Başkanlığı' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('mesai_baslat').setLabel('▶️ Mesai Başlat').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('mesai_bitir').setLabel('⏹️ Mesai Bitir').setStyle(ButtonStyle.Danger)
        );
        await interaction.reply({ content: 'Panel başarıyla oluşturuluyor...', ephemeral: true });
        await interaction.channel.send({ embeds: [embed], components: [row] });
    }

    if (commandName === 'mesai-sorgu') {
        if (!yetkiKontrol(interaction)) {
            return interaction.reply({ content: `❌ Bu komutu kullanmak ve personellerin detaylı profillerini görmek için Yetkiniz veya **${MESAİ_SORUMLUSU_ROL_ADI}** rolünüz bulunmalıdır.`, ephemeral: true });
        }

        const hedef = interaction.options.getMember('kullanici');
        const toplamSaniye = toplamSureler.get(hedef.id) || 0;
        const toplamGiris = mesaiGirisSayilari.get(hedef.id) || 0;
        const sonGiris = sonGirisTarihleri.get(hedef.id) || "Kayıt Yok";

        const saat = Math.floor(toplamSaniye / 3600);
        const dakika = Math.floor((toplamSaniye % 3600) / 60);

        const gridSaniye = hesaplaGunlukOrtalamaSaniye(hedef.id, toplamSaniye);
        const ortSaat = Math.floor(gridSaniye / 3600);
        const ortDk = Math.floor((gridSaniye % 3600) / 60);
        const günlükOrtalamaMetin = `\`${ortSaat > 0 ? ortSaat + ' sa ' : ''}${ortDk} dk / gün\``;

        const sorguEmbed = new EmbedBuilder()
            .setTitle('📂 PERSONEL DETAYLI MESAİ PROFİLİ')
            .setDescription(`👤 **Personel:** ${hedef}\n📂 **Kurum Birimi:** Adalet Bakanlığı`)
            .addFields(
                { name: '⏱️ Toplam Çalışma Süresi', value: `\`${saat} Saat, ${dakika} Dakika\``, inline: true },
                { name: '📥 Toplam Mesai Seansı', value: `\`${toplamGiris} Kez Göreve Çıktı\``, inline: true },
                { name: '📊 Günlük Ortalama Süre', value: günlükOrtalamaMetin, inline: true },
                { name: '📅 En Son Görev Başlangıcı', value: `\`${sonGiris}\``, inline: false }
            )
            .setThumbnail(BAKANLIK_LOGO)
            .setColor('#3498db')
            .setFooter({ text: `Sorgulayan Yetkili: ${interaction.user.username}` })
            .setTimestamp();
            
        return interaction.reply({ embeds: [sorguEmbed] });
    }

    // GÜNCELLENDİ: TOPLAM SAATE GÖRE SIRALAYAN AMA YANDA ORTALAMAYI DA GÖSTEREN /mesai-top
    if (commandName === 'mesai-top') {
        if (toplamSureler.size === 0) return interaction.reply({ content: 'Henüz kaydedilmiş bir mesai süresi bulunmuyor.', ephemeral: true });
        
        const siralamaListesi = [];
        toplamSureler.forEach((toplamSaniye, userId) => {
            const gunlukOrtalamaSaniye = hesaplaGunlukOrtalamaSaniye(userId, toplamSaniye);
            siralamaListesi.push({ userId, toplamSaniye, gunlukOrtalamaSaniye });
        });

        // KURAL: En yüksek toplam mesai süresine (toplamSaniye) göre büyükten küçüğe sırala!
        siralamaListesi.sort((a, b) => b.toplamSaniye - a.toplamSaniye);
        const ilkOn = siralamaListesi.slice(0, 10);

        let aciklama = "🏆 **En Çok Mesai Yapan İlk 10 Personel**\n\n";
        let sira = 1;

        for (const data of ilkOn) {
            // Toplam Süre Hesaplama
            const tSaat = Math.floor(data.toplamSaniye / 3600);
            const tDakika = Math.floor((data.toplamSaniye % 3600) / 60);
            const toplamMetin = `\`${tSaat} Saat ${tDakika} Dakika\``;

            // Günlük Ortalama Hesaplama
            const oSaat = Math.floor(data.gunlukOrtalamaSaniye / 3600);
            const oDakika = Math.floor((data.gunlukOrtalamaSaniye % 3600) / 60);
            const ortalamaMetin = `\`Ort: ${oSaat > 0 ? oSaat + 'sa ' : ''}${oDakika}dk/gün\``;

            aciklama += `**${sira}.** <@${data.userId}> ➔ ${toplamMetin} | ${ortalamaMetin}\n`;
            sira++;
        }

        const topEmbed = new EmbedBuilder()
            .setTitle('🏛️ ADALET BAKANLIĞI PERFORMANS SIRALAMASI')
            .setDescription(aciklama)
            .setThumbnail(BAKANLIK_LOGO)
            .setColor('#f1c40f')
            .setFooter({ text: 'Sıralama toplam çalışma sürelerine göre yapılmaktadır.' })
            .setTimestamp();

        return interaction.reply({ embeds: [topEmbed] });
    }

    if (commandName === 'aktif-mesai') {
        if (aktifMesailer.size === 0) {
            return interaction.reply({ content: 'ℹ️ Şu anda aktif mesaide olan herhangi bir personel bulunmamaktadır.', ephemeral: false });
        }

        let listeMetni = "🟢 **Şu Anda Görevde Olan Personel Listesi:**\n\n";
        aktifMesailer.forEach((girisZamani, userId) => {
            const gecenSureSaniye = Math.floor((Date.now() - girisZamani) / 1000
