const http = require('http');
http.createServer((req, res) => res.end('EGM Botu Aktif!')).listen(process.env.PORT || 3000);

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, ApplicationCommandOptionType } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// CONFIG AYARLARI (EGM TEMASI)
const EGM_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/EGM_Logo.png/800px-EGM_Logo.png';
const LOG_KANAL_ID = 'YENİ_GİRECEĞİN_LOG_KANAL_IDSI'; 
const MESAİ_SORUMLUSU_ROL_ADI = 'EGM Sorumlusu'; // Sunucundaki yetkili rol adı

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

// BOT AÇILDIĞINDA YEDEĞİ GERİ YÜKLER
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
            
            console.log("EGM devriye verileri başarıyla yüklendi!");
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

function hesaplaGunlukOrtalamaSaniye(userId, toplamSaniye) {
    const ilkKayitMs = mesaiBaslangicTarihleri.get(userId);
    if (!ilkKayitMs || toplamSaniye <= 0) return 0;
    const gecenSureMs = Date.now() - Number(ilkKayitMs);
    const gecenGunSayisi = Math.max(1, Math.ceil(gecenSureMs / (1000 * 60 * 60 * 24)));
    return Math.floor(toplamSaniye / gecenGunSayisi);
}

const commands = [
    {
        name: 'egm-panel',
        description: 'Emniyet Genel Müdürlüğü devriye/mesai buton panelini oluşturur. (Yönetici)',
    },
    {
        name: 'polis-sorgu',
        description: 'Bir emniyet personelinin detaylı devriye/mesai profilini gösterir.',
        options: [{ name: 'kullanici', description: 'Sorgulanacak personeli seçin.', type: ApplicationCommandOptionType.User, required: true }]
    },
    {
        name: 'egm-top',
        description: 'En çok mesai yapan ilk 10 emniyet personelini listeler.',
    },
    {
        name: 'aktif-devriye',
        description: 'Şu anda aktif görevde/devriyede olan tüm personelleri listeler.',
    },
    {
        name: 'mesai-kapat',
        description: 'Aktif görevde olan bir personelin mesaisini zorla kapatır. (EGM Yetkilisi)',
        options: [{ name: 'kullanici', description: 'Mesaisi kapatılacak personel', type: ApplicationCommandOptionType.User, required: true }]
    },
    {
        name: 'toplu-mesai-kapat',
        description: 'Aktif görevdeki HERKESİN mesaisini toplu olarak sonlandırır.',
    },
    {
        name: 'mesai-ayarla',
        description: 'Emniyet personeli mesai süresini manuel düzenler.',
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
    console.log(`${client.user.tag} (EGM Botu) aktif!`);
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

    if (commandName === 'egm-panel') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: 'Bu komutu kullanmak için Yönetici yetkisine sahip olmalısınız.', ephemeral: true });
        }
        const embed = new EmbedBuilder()
            .setTitle('🚨 T.C. EMNİYET GENEL MÜDÜRLÜĞÜ MESAİ SİSTEMİ')
            .setDescription('🚓 **EMNİYET PERSONELİ DEVRİYE VE MESAİ TALİMATI**\n\nGöreve başlarken veya devriyenizi sonlandırırken aşağıdaki butonları kullanmanız gerekmektedir.\n\n⚠️ *Mesai süreleriniz EGM Bilgi İşlem sistemi tarafından anlık olarak kayıt altına alınmaktadır.*')
            .setThumbnail(EGM_LOGO)
            .setColor('#002b66')
            .setFooter({ text: 'T.C. Emniyet Genel Müdürlüğü Bilgi Teknolojileri ve Haberleşme Daire Başkanlığı' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('mesai_baslat').setLabel('🔵 Göreve Başla (Mesai)').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('mesai_bitir').setLabel('🔴 Görevi Bitir (Mesai)').setStyle(ButtonStyle.Danger)
        );
        await interaction.reply({ content: 'EGM Mesai paneli oluşturuluyor...', ephemeral: true });
        await interaction.channel.send({ embeds: [embed], components: [row] });
    }

    if (commandName === 'polis-sorgu') {
        if (!yetkiKontrol(interaction)) {
            return interaction.reply({ content: `❌ Personel sorgusu yapmak için Yetkiniz veya **${MESAİ_SORUMLUSU_ROL_ADI}** rolünüz bulunmalıdır.`, ephemeral: true });
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
            .setTitle('👮 EMNİYET PERSONELİ MESAİ PROFİLİ')
            .setDescription(`👤 **Personel:** ${hedef}\n🛡️ **Birim:** Emniyet Genel Müdürlüğü`)
            .addFields(
                { name: '⏱️ Toplam Görev Süresi', value: `\`${saat} Saat, ${dakika} Dakika\``, inline: true },
                { name: '📥 Toplam Devriye Seansı', value: `\`${toplamGiris} Kez Göreve Çıktı\``, inline: true },
                { name: '📊 Günlük Ortalama Devriye', value: günlükOrtalamaMetin, inline: true },
                { name: '📅 Son Görev Başlangıcı', value: `\`${sonGiris}\``, inline: false }
            )
            .setThumbnail(EGM_LOGO)
            .setColor('#1f4e78')
            .setFooter({ text: `Sorgulayan EGM Yetkilisi: ${interaction.user.username}` })
            .setTimestamp();
            
        return interaction.reply({ embeds: [sorguEmbed] });
    }

    if (commandName === 'egm-top') {
        if (toplamSureler.size === 0) return interaction.reply({ content: 'Henüz kaydedilmiş bir görev süresi bulunmuyor.', ephemeral: true });
        
        const siralamaListesi = [];
        toplamSureler.forEach((toplamSaniye, userId) => {
            const gunlukOrtalamaSaniye = hesaplaGunlukOrtalamaSaniye(userId, toplamSaniye);
            siralamaListesi.push({ userId, toplamSaniye, gunlukOrtalamaSaniye });
        });

        siralamaListesi.sort((a, b) => b.toplamSaniye - a.toplamSaniye);
        const ilkOn = siralamaListesi.slice(0, 10);

        let aciklama = "🏆 **En Çok Görev Yapan İlk 10 Emniyet Personeli**\n\n";
        let sira = 1;

        for (const data of ilkOn) {
            const tSaat = Math.floor(data.toplamSaniye / 3600);
            const tDakika = Math.floor((data.toplamSaniye % 3600) / 60);
            const toplamMetin = `\`${tSaat} Saat ${tDakika} Dakika\``;

            const oSaat = Math.floor(data.gunlukOrtalamaSaniye / 3600);
            const oDakika = Math.floor((data.gunlukOrtalamaSaniye % 3600) / 60);
            const ortalamaMetin = `\`Ort: ${oSaat > 0 ? oSaat + 'sa ' : ''}${oDakika}dk/gün\``;

            aciklama += `**${sira}.** <@${data.userId}> ➔ ${toplamMetin} | ${ortalamaMetin}\n`;
            sira++;
        }

        const topEmbed = new EmbedBuilder()
            .setTitle('🚨 EMNİYET GENEL MÜDÜRLÜĞÜ PERFORMANS SIRALAMASI')
            .setDescription(aciklama)
            .setThumbnail(EGM_LOGO)
            .setColor('#002b66')
            .setFooter({ text: 'Sıralama toplam devriye ve görev sürelerine göre yapılmaktadır.' })
            .setTimestamp();

        return interaction.reply({ embeds: [topEmbed] });
    }

    if (commandName === 'aktif-devriye') {
        if (aktifMesailer.size === 0) {
            return interaction.reply({ content: 'ℹ️ Şu anda devriyede veya görevde olan herhangi bir emniyet personeli bulunmamaktadır.', ephemeral: false });
        }

        let listeMetni = "🔵 **Şu Anda Görevde Olan Polis Personelleri:**\n\n";
        aktifMesailer.forEach((girisZamani, userId) => {
            const gecenSureSaniye = Math.floor((Date.now() - girisZamani) / 1000);
            const saat = Math.floor(gecenSureSaniye / 3600);
            const dakika = Math.floor((gecenSureSaniye % 3600) / 60);
            
            listeMetni += `• <@${userId}> ➔ \`${saat} sa, ${dakika} dk gündür görevde\` (Giriş: \`${formatTRTarih(new Date(girisZamani))}\`)\n`;
        });

        const aktifEmbed = new EmbedBuilder()
            .setTitle('🚓 AKTİF DEVRİYEDEKİ PERSONELLER')
            .setDescription(listeMetni)
            .setThumbnail(EGM_LOGO)
            .setColor('#2980b9')
            .setFooter({ text: `Toplam ${aktifMesailer.size} personel sahada görev yapıyor.` })
            .setTimestamp();

        return interaction.reply({ embeds: [aktifEmbed] });
    }

    if (commandName === 'mesai-kapat') {
        if (!yetkiKontrol(interaction)) return interaction.reply({ content: `❌ Bu komutu kullanmak için Yetkiniz veya **${MESAİ_SORUMLUSU_ROL_ADI}** rolünüz bulunmalıdır.`, ephemeral: true });
        const hedef = interaction.options.getUser('kullanici');
        if (!aktifMesailer.has(hedef.id)) return interaction.reply({ content: '❌ Belirtilen personelin şu anda aktif bir görevi bulunmuyor.', ephemeral: true });

        const girisZamani = aktifMesailer.get(hedef.id);
        const gecenSureSaniye = Math.floor((Date.now() - girisZamani) / 1000);
        const eskiSure = toplamSureler.get(hedef.id) || 0;
        const yeniToplam = eskiSure + gecenSureSaniye;

        toplamSureler.set(hedef.id, yeniToplam);
        await veriKaydet(interaction.guild);
        aktifMesailer.delete(hedef.id);

        const logKanali = interaction.guild.channels.cache.get(LOG_KANAL_ID);
        interaction.reply({ content: `✅ ${hedef} isimli personelin aktif görevi sonlandırıldı.`, ephemeral: true });

        if (logKanali) {
            const tSaat = Math.floor(yeniToplam / 3600);
            const tDakika = Math.floor((yeniToplam % 3600) / 60);
            const logEmbed = new EmbedBuilder()
                .setTitle('🚨 MESAİ AMİR TARAFINDAN ZORLA KAPATILDI')
                .setDescription(`👤 **Görevi Kapatılan:** ${hedef}\n🛡️ **Kapatan Amir:** ${interaction.user}\n\n⏱️ **Devriyede Kazanılan Süre:** \`${Math.floor(gecenSureSaniye / 3600)} Saat, ${Math.floor((gecenSureSaniye % 3600) / 60)} Dakika\`\n🗃️ **Güncel Toplam Süre:** \`${tSaat} Saat, ${tDakika} Dakika\``)
                .setImage(EGM_LOGO)
                .setColor('#c0392b')
                .setTimestamp();
            logKanali.send({ embeds: [logEmbed] });
        }
    }

    if (commandName === 'toplu-mesai-kapat') {
        if (!yetkiKontrol(interaction)) return interaction.reply({ content: `❌ Bu komutu kullanmak için Yetkiniz veya **${MESAİ_SORUMLUSU_ROL_ADI}** rolünüz bulunmalıdır.`, ephemeral: true });
        if (aktifMesailer.size === 0) return interaction.reply({ content: '❌ Aktif devriyede kimse bulunmadığı için toplu kapatma yapılamaz.', ephemeral: true });

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

        await interaction.editReply({ content: `✅ Sahadaki toplam **${kapatilanlar.length}** personelin görevi başarıyla sonlandırıldı.` });

        if (logKanali) {
            const topluEmbed = new EmbedBuilder()
                .setTitle('🚨 TÜM PERSONELLERİN MESAİSİ KAPATILDI')
                .setDescription(`🛡️ **İşlemi Yapan Amir:** ${interaction.user}\n\n👥 **Görevi Sonlandırılan Personeller:**\n${kapatilanlar.join('\n')}`)
                .setImage(EGM_LOGO)
                .setColor('#95a5a6')
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
                .setDescription(`👤 **İşlem Yapılan Personel:** ${hedef}\n🛡️ **İşlemi Yapan Amir:** ${interaction.user}\n\n${logAciklama}\n🗃️ **Yeni Toplam Süre:** \`${tSaat} Saat, ${tDakika} Dakika\``)
                .setImage(EGM_LOGO).setColor(logRenk).setTimestamp();
            logKanali.send({ embeds: [logEmbed] });
        }
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    const logKanali = interaction.guild.channels.cache.get(LOG_KANAL_ID);
    const userId = interaction.user.id;

    if (interaction.customId === 'mesai_baslat') {
        if (aktifMesailer.has(userId)) return interaction.reply({ content: '❌ Zaten aktif bir göreviniz/devriyeniz bulunuyor!', ephemeral: true });
        const simdi = Date.now();
        aktifMesailer.set(userId, simdi);

        const eskiGiris = mesaiGirisSayilari.get(userId) || 0;
        mesaiGirisSayilari.set(userId, eskiGiris + 1);
        
        if (!mesaiBaslangicTarihleri.has(userId)) {
            mesaiBaslangicTarihleri.set(userId, simdi);
        }
        
        const trTarihMetni = formatTRTarih(new Date(simdi));
        sonGirisTarihleri.set(userId, trTarihMetni);

        await interaction.reply({ content: '🔵 **EGM Göreviniz Başlatıldı.** İyi görevler dileriz!', ephemeral: true });

        if (logKanali) {
            const mevcutToplamSaniye = toplamSureler.get(userId) || 0;
            const mSaat = Math.floor(mevcutToplamSaniye / 3600);
            const mDakika = Math.floor((mevcutToplamSaniye % 3600) / 60);
            const logEmbed = new EmbedBuilder()
                .setTitle('📥 GÖREVE BAŞLANDI (EGM)')
                .setDescription(`👤 **Personel:** ${interaction.user}\n\n📅 **Giriş Saati:** \`${trTarihMetni}\`\n🗃️ **Mevcut Toplam Görev Süresi:** \`${mSaat} Saat, ${mDakika} Dakika\``)
                .setImage(EGM_LOGO).setColor('#2980b9').setTimestamp();
            logKanali.send({ embeds: [logEmbed] });
        }
    }

    if (interaction.customId === 'mesai_bitir') {
        if (!aktifMesailer.has(userId)) return interaction.reply({ content: '❌ Aktif bir göreviniz bulunmuyor!', ephemeral: true });
        const girisZamani = aktifMesailer.get(userId);
        const gecenSureSaniye = Math.floor((Date.now() - girisZamani) / 1000);
        const eskiSure = toplamSureler.get(userId) || 0;
        const yeniToplam = eskiSure + gecenSureSaniye;
        
        toplamSureler.set(userId, yeniToplam);
        await veriKaydet(interaction.guild); 
        aktifMesailer.delete(userId);

        const dakika = Math.floor(gecenSureSaniye / 60);
        const saniye = gecenSureSaniye % 60;
        await interaction.reply({ content: `🔴 **Göreviniz Bitti.** Bu devriyedeki süreniz: **${dakika} dakika, ${saniye} saniye.**`, ephemeral: true });

        if (logKanali) {
            const tSaat = Math.floor(yeniToplam / 3600);
            const tDakika = Math.floor((yeniToplam % 3600) / 60);
            const logEmbed = new EmbedBuilder()
                .setTitle('📤 GÖREV BİTTİ (EGM)')
                .setDescription(`👤 **Personel:** ${interaction.user}\n\n⏱️ **Bu Oturumdaki Süre:** \`${dakika} Dakika, ${saniye} Saniye\`\n🗃️ **Güncel Toplam Süre:** \`${tSaat} Saat, ${tDakika} Dakika\``)
                .setImage(EGM_LOGO).setColor('#e74c3c').setTimestamp();
            logKanali.send({ embeds: [logEmbed] });
        }
    }
});

client.login(process.env.TOKEN);
