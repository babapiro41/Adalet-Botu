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

let toplamSureler = new Map();
const aktifMesailer = new Map();

// VERİLERİ DISCORD LOG KANALINA YEDEKLER
async function veriKaydet(guild) {
    const logKanali = guild.channels.cache.get(LOG_KANAL_ID);
    if (!logKanali) return;

    const obj = Object.fromEntries(toplamSureler);
    const sifredat = Buffer.from(JSON.stringify(obj)).toString('base64');
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
            toplamSureler = new Map(Object.entries(parsed));
            console.log("Mesai süreleri Discord yedeğinden başarıyla geri yüklendi!");
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

const commands = [
    {
        name: 'mesai-panel',
        description: 'Adalet Bakanlığı mesai buton panelini oluşturur. (Yönetici)',
    },
    {
        name: 'mesai-sorgu',
        description: 'Bir personelin veya kendinizin toplam mesai süresini gösterir.',
        options: [{ name: 'kullanici', description: 'Sorgulanacak personeli seçin.', type: ApplicationCommandOptionType.User, required: false }]
    },
    {
        name: 'mesai-top',
        description: 'En çok mesai yapan ilk 10 personeli listeler.',
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
        const hedef = interaction.options.getMember('kullanici') || interaction.member;
        const toplamSaniye = toplamSureler.get(hedef.id) || 0;
        const saat = Math.floor(toplamSaniye / 3600);
        const dakika = Math.floor((toplamSaniye % 3600) / 60);

        const sorguEmbed = new EmbedBuilder()
            .setTitle('📊 PERSONEL MESAİ RAPORU')
            .setDescription(`👤 **Personel Bilgisi:** ${hedef}\n\n⏱️ **Toplam Çalışma Süresi:** \`${saat} Saat, ${dakika} Dakika\`\n📂 **Kurum Birimi:** Adalet Bakanlığı Personeli`)
            .setThumbnail(BAKANLIK_LOGO)
            .setColor('#3498db')
            .setTimestamp();
        return interaction.reply({ embeds: [sorguEmbed] });
    }

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
            .setThumbnail(BAKANLIK_LOGO)
            .setColor('#f1c40f')
            .setTimestamp();
        return interaction.reply({ embeds: [topEmbed] });
    }

    // YENİ: /aktif-mesai KOMUTU
    if (commandName === 'aktif-mesai') {
        if (aktifMesailer.size === 0) {
            return interaction.reply({ content: 'ℹ️ Şu anda aktif mesaide olan herhangi bir personel bulunmamaktadır.', ephemeral: false });
        }

        let listeMetni = "🟢 **Şu Anda Görevde Olan Personel Listesi:**\n\n";
        aktifMesailer.forEach((girisZamani, userId) => {
            const gecenSureSaniye = Math.floor((Date.now() - girisZamani) / 1000);
            const saat = Math.floor(gecenSureSaniye / 3600);
            const dakika = Math.floor((gecenSureSaniye % 3600) / 60);
            
            listeMetni += `• <@${userId}> ➔ \`${saat} sa, ${dakika} dk gündür görevde\` (Giriş: \`${formatTRTarih(new Date(girisZamani))}\`)\n`;
        });

        const aktifEmbed = new EmbedBuilder()
            .setTitle('🏛️ AKTİF MESAİDEKİ PERSONELLER')
            .setDescription(listeMetni)
            .setThumbnail(BAKANLIK_LOGO)
            .setColor('#2ecc71')
            .setFooter({ text: `Toplam ${aktifMesailer.size} personel görevde.` })
            .setTimestamp();

        return interaction.reply({ embeds: [aktifEmbed] });
    }

    if (commandName === 'mesai-kapat') {
        if (!yetkiKontrol(interaction)) return interaction.reply({ content: `❌ Bu komutu kullanmak için Yetkiniz veya **${MESAİ_SORUMLUSU_ROL_ADI}** rolünüz bulunmalıdır.`, ephemeral: true });
        const hedef = interaction.options.getUser('kullanici');
        if (!aktifMesailer.has(hedef.id)) return interaction.reply({ content: '❌ Belirtilen personelin şu anda aktif bir mesaisi bulunmuyor.', ephemeral: true });

        const girisZamani = aktifMesailer.get(hedef.id);
        const gecenSureSaniye = Math.floor((Date.now() - girisZamani) / 1000);
        const eskiSure = toplamSureler.get(hedef.id) || 0;
        const yeniToplam = eskiSure + gecenSureSaniye;

        toplamSureler.set(hedef.id, yeniToplam);
        await veriKaydet(interaction.guild);
        aktifMesailer.delete(hedef.id);

        const logKanali = interaction.guild.channels.cache.get(LOG_KANAL_ID);
        interaction.reply({ content: `✅ ${hedef} isimli personelin aktif mesaisi sonlandırıldı.`, ephemeral: true });

        if (logKanali) {
            const tSaat = Math.floor(yeniToplam / 3600);
            const tDakika = Math.floor((yeniToplam % 3600) / 60);
            const logEmbed = new EmbedBuilder()
                .setTitle('🚨 MESAİ YETKİLİ TARAFINDAN ZORLA KAPATILDI')
                .setDescription(`👤 **Mesaisi Kapatılan:** ${hedef}\n🛡️ **Kapatan Yetkili:** ${interaction.user}\n\n⏱️ **Oturumda Kazanılan Süre:** \`${Math.floor(gecenSureSaniye / 3600)} Saat, ${Math.floor((gecenSureSaniye % 3600) / 60)} Dakika\`\n🗃️ **Güncel Toplam Süre:** \`${tSaat} Saat, ${tDakika} Dakika\``)
                .setImage(BAKANLIK_LOGO)
                .setColor('#d35400')
                .setTimestamp();
            logKanali.send({ embeds: [logEmbed] });
        }
    }

    // YENİ: /toplu-mesai-kapat KOMUTU
    if (commandName === 'toplu-mesai-kapat') {
        if (!yetkiKontrol(interaction)) return interaction.reply({ content: `❌ Bu komutu kullanmak için Yetkiniz veya **${MESAİ_SORUMLUSU_ROL_ADI}** rolünüz bulunmalıdır.`, ephemeral: true });
        if (aktifMesailer.size === 0) return interaction.reply({ content: '❌ Şu anda aktif mesaide kimse bulunmadığı için toplu kapatma yapılamaz.', ephemeral: true });

        const kapatilanlar = [];
        const logKanali = interaction.guild.channels.cache.get(LOG_KANAL_ID);
        
        await interaction.deferReply({ ephemeral: true });

        aktifMesailer.forEach((girisZamani, userId) => {
            const gecenSureSaniye = Math.floor((Date.now() - girisZamani) / 1000);
            const eskiSure = toplamSureler.get(userId) || 0;
            const yeniToplam = eskiSure + gecenSureSaniye;

            toplamSureler.set(userId, yeniToplam);
            kapatilanlar.push(`<@${userId}> (\`${Math.floor(gecenSureSaniye / 60)} dk\`)`);
        });

        aktifMesailer.clear(); 
        await veriKaydet(interaction.guild);

        await interaction.editReply({ content: `✅ Aktif mesaideki toplam **${kapatilanlar.length}** personelin mesaisi başarıyla toplu olarak sonlandırıldı.` });

        if (logKanali) {
            const topluEmbed = new EmbedBuilder()
                .setTitle('🚨 HERKESİN MESAİSİ TOPLU OLARAK KAPATILDI')
                .setDescription(`🛡️ **İşlemi Yapan Yetkili:** ${interaction.user}\n\n👥 **Mesaisi Sonlandırılan Personeller:**\n${kapatilanlar.join('\n')}`)
                .setImage(BAKANLIK_LOGO)
                .setColor('#c0392b')
                .setTimestamp();
            logKanali.send({ embeds: [topluEmbed] });
        }
    }

    if (commandName === 'mesai-ayarla') {
        if (!yetkiKontrol(interaction)) return interaction.reply({ content: `❌ Bu komutu kullanmak için Yetkiniz veya **${MESAİ_SORUMLUSU_ROL_ADI}** rolünüz bulunmalıdır.`, ephemeral: true });
        const hedef = interaction.options.getUser('kullanici');
        const islem = interaction.options.getString('islem');
        const saat = interaction.options.getInteger('saat');
        const dakika = interaction.options.getInteger('dakika');

        const degisimSaniyesi = (saat * 3600) + (dakika * 60);
        const mevcutSure = toplamSureler.get(hedef.id) || 0;
        let yeniToplam = mevcutSure;
        let logBaslik = ""; let logRenk = ""; let logAciklama = "";

        if (islem === 'ekle') {
            yeniToplam = mevcutSure + degisimSaniyesi;
            logBaslik = '➕ MANUEL MESAİ SÜRESİ EKLENDİ'; logRenk = '#27ae60';
            logAciklama = `➕ **Eklenen Süre:** \`${saat} Saat, ${dakika} Dakika\``;
            interaction.reply({ content: `✅ Süre başarıyla eklendi.`, ephemeral: true });
        } else if (islem === 'sil') {
            yeniToplam = mevcutSure - degisimSaniyesi; if (yeniToplam < 0) yeniToplam = 0;
            logBaslik = '➖ MANUEL MESAİ SÜRESİ SİLİNDİ'; logRenk = '#c0392b';
            logAciklama = `➖ **Silinen Süre:** \`${saat} Saat, ${dakika} Dakika\``;
            interaction.reply({ content: `✅ Süre başarıyla silindi.`, ephemeral: true });
        }

        toplamSureler.set(hedef.id, yeniToplam);
        await veriKaydet(interaction.guild);

        const logKanali = interaction.guild.channels.cache.get(LOG_KANAL_ID);
        if (logKanali) {
            const tSaat = Math.floor(yeniToplam / 3600);
            const tDakika = Math.floor((yeniToplam % 3600) / 60);
            const logEmbed = new EmbedBuilder()
                .setTitle(logBaslik)
                .setDescription(`👤 **İşlem Yapılan Personel:** ${hedef}\n🛡️ **İşlemi Yapan Yetkili:** ${interaction.user}\n\n${logAciklama}\n🗃️ **Yeni Toplam Süre:** \`${tSaat} Saat, ${tDakika} Dakika\``)
                .setImage(BAKANLIK_LOGO).setColor(logRenk).setTimestamp();
            logKanali.send({ embeds: [logEmbed] });
        }
    }
});

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
                .setImage(BAKANLIK_LOGO).setColor('#2ecc71').setTimestamp();
            logKanali.send({ embeds: [logEmbed] });
        }
    }

    if (interaction.customId === 'mesai_bitir') {
        if (!aktifMesailer.has(userId)) return interaction.reply({ content: '❌ Aktif bir mesainiz bulunmuyor!', ephemeral: true });
        const girisZamani = aktifMesailer.get(userId);
        const gecenSureSaniye = Math.floor((Date.now() - girisZamani) / 1000);
        const eskiSure = toplamSureler.get(userId) || 0;
        const yeniToplam = eskiSure + gecenSureSaniye;
        
        toplamSureler.set(userId, yeniToplam);
        await veriKaydet(interaction.guild); 
        aktifMesailer.delete(userId);

        const dakika = Math.floor(gecenSureSaniye / 60);
        const saniye = gecenSureSaniye % 60;
        await interaction.reply({ content: `⏹️ Mesainiz bitirildi. Süreniz: **${dakika} dakika, ${saniye} saniye.**`, ephemeral: true });

        if (logKanali) {
            const tSaat = Math.floor(yeniToplam / 3600);
            const tDakika = Math.floor((yeniToplam % 3600) / 60);
            const logEmbed = new EmbedBuilder()
                .setTitle('📤 MESAİ ÇIŞI YAPILDI')
                .setDescription(`👤 **Personel:** ${interaction.user}\n\n⏱️ **Bu Oturumdaki Süre:** \`${dakika} Dakika, ${saniye} Saniye\`\n🗃️ **Güncel Toplam Süre:** \`${tSaat} Saat, ${tDakika} Dakika\``)
                .setImage(BAKANLIK_LOGO).setColor('#e74c3c').setTimestamp();
            logKanali.send({ embeds: [logEmbed] });
        }
    }
});

client.login(process.env.TOKEN);
