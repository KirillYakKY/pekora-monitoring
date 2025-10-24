const https = require('https');

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;
const LAST_ITEM_ID = process.env.LAST_ITEM_ID;
let currentLastId = LAST_ITEM_ID;

// Функция для отправки запросов
function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        if (postData) {
            req.write(postData);
        }
        
        req.end();
    });
}

// Функция для отправки уведомления в Discord
async function sendDiscordNotification(item) {
    const itemUrl = `https://www.pekora.zip/catalog/${item.id}/www`;
    const itemImageUrl = `https://www.pekora.zip/Thumbs/Asset.ashx?width=110&height=110&assetId=${item.id}`;

    const priceText = item.price && item.price > 0 ? `${item.price} R$` : "Бесплатно";

    const embed = {
        title: "🎯 НОВЫЙ ТОВАР В КАТАЛОГЕ!",
        description: `**${item.name || 'Без названия'}**`,
        color: 0x00FF00,
        fields: [
            {
                name: "💰 Цена",
                value: priceText,
                inline: true
            },
            {
                name: "🆔 ID товара",
                value: `\`${item.id}\``,
                inline: true
            },
            {
                name: "👤 Создатель",
                value: item.creatorName || "Неизвестно",
                inline: true
            },
            {
                name: "📦 Тип предмета",
                value: item.itemType || "Asset",
                inline: true
            },
            {
                name: "📊 Продано копий",
                value: item.saleCount ? item.saleCount.toLocaleString() : "0",
                inline: true
            },
            {
                name: "🔄 В продаже",
                value: item.isForSale ? "✅ Да" : "❌ Нет",
                inline: true
            }
        ],
        thumbnail: { url: itemImageUrl },
        image: { url: itemImageUrl },
        timestamp: new Date().toISOString(),
        footer: {
            text: "GitHub Actions • 24/7 Pekora Monitor"
        },
        url: itemUrl
    };

    const payload = {
        content: "<@1431351504119271616> 🚀 **ПОЯВИЛСЯ НОВЫЙ ТОВАР!**",
        embeds: [embed]
    };

    const options = {
        hostname: 'discord.com',
        path: '/api/webhooks/1431342479222767616/oCWPhuALqVEnH9jCmDVAfCrpgXuY2oXjpInHwiF1vb9HUivbUgMwW8kEAzsTVMXHLrl5'.replace('https://discord.com', ''),
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(JSON.stringify(payload))
        }
    };

    try {
        await makeRequest(options, JSON.stringify(payload));
        console.log(`✅ Уведомление отправлено для товара ${item.id}`);
        return true;
    } catch (error) {
        console.log(`❌ Ошибка отправки: ${error.message}`);
        return false;
    }
}

// Функция для получения детальной информации
async function getItemDetails(itemIds) {
    const options = {
        hostname: 'www.pekora.zip',
        path: '/apisite/catalog/v1/catalog/items/details',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.pekora.zip/'
        }
    };

    try {
        const data = await makeRequest(options, JSON.stringify(itemIds));
        return data.data || [];
    } catch (error) {
        console.log('❌ Ошибка получения деталей:', error.message);
        return [];
    }
}

// Основная функция мониторинга
async function monitor() {
    console.log('🚀 Запуск проверки...');
    console.log('⏰ Время:', new Date().toISOString());
    console.log('📝 Текущий последний ID:', currentLastId);

    try {
        // Получаем список товаров
        const apiOptions = {
            hostname: 'www.pekora.zip',
            path: '/apisite/catalog/v1/search/items?category=Collectibles&limit=5&sortType=3',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': 'https://www.pekora.zip/'
            }
        };

        const data = await makeRequest(apiOptions);
        
        if (data && data.data && data.data.length > 0) {
            const newestItem = data.data[0];

            if (newestItem && newestItem.id) {
                // Первый запуск
                if (!currentLastId) {
                    console.log(`📝 Установлен начальный ID: ${newestItem.id}`);
                    await updateSecret('LAST_ITEM_ID', newestItem.id.toString());
                    return;
                }

                // Проверяем новый товар
                if (newestItem.id.toString() !== currentLastId) {
                    console.log(`🎉 ОБНАРУЖЕН НОВЫЙ ТОВАР!`);
                    console.log(`📋 Старый ID: ${currentLastId} → Новый ID: ${newestItem.id}`);

                    // Получаем детали
                    const detailedItems = await getItemDetails([newestItem.id]);
                    const fullItemData = detailedItems[0] || newestItem;

                    console.log(`📦 Название: ${fullItemData.name || 'Нет названия'}`);
                    console.log(`💰 Цена: ${fullItemData.price || 'Бесплатно'}`);

                    // Отправляем уведомление
                    const success = await sendDiscordNotification(fullItemData);
                    
                    if (success) {
                        currentLastId = newestItem.id.toString();
                        await updateSecret('LAST_ITEM_ID', currentLastId);
                        console.log(`✅ ID обновлен: ${currentLastId}`);
                    }
                } else {
                    console.log('✅ Новых товаров нет');
                }
            }
        }
    } catch (error) {
        console.log('❌ Ошибка мониторинга:', error.message);
    }
}

// Функция для обновления секрета (симуляция)
async function updateSecret(name, value) {
    console.log(`🔐 [SIMULATION] Обновление секрета ${name} = ${value}`);
    // В GitHub Actions секреты обновляются через GitHub API
    // Здесь просто логируем для демонстрации
}

// Запуск
monitor().catch(console.error);
