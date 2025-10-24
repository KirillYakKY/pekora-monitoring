const https = require('https');
const fs = require('fs');
const path = require('path');

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;
const DATA_FILE = path.join(process.env.GITHUB_WORKSPACE || __dirname, 'last-item.txt');

// Функция для чтения последнего ID из файла
function readLastItemId() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return fs.readFileSync(DATA_FILE, 'utf8').trim();
        }
    } catch (error) {
        console.log('❌ Ошибка чтения файла:', error.message);
    }
    return null;
}

// Функция для сохранения последнего ID в файл
function saveLastItemId(itemId) {
    try {
        fs.writeFileSync(DATA_FILE, itemId.toString());
        console.log(`💾 ID сохранен в файл: ${itemId}`);
        return true;
    } catch (error) {
        console.log('❌ Ошибка сохранения файла:', error.message);
        return false;
    }
}

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
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(JSON.parse(data));
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                } catch (e) {
                    reject(new Error(`Parse error: ${e.message}`));
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

    // Извлекаем путь из вебхука
    const webhookPath = DISCORD_WEBHOOK.replace('https://discord.com', '');

    const options = {
        hostname: 'discord.com',
        path: webhookPath,
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
    console.log('🚀 Запуск проверки Pekora...');
    console.log('⏰ Время:', new Date().toISOString());
    
    // Читаем последний ID из файла
    const lastItemId = readLastItemId();
    console.log('📝 Последний известный ID:', lastItemId || 'Не установлен');

    try {
        // Получаем список товаров
        const apiOptions = {
            hostname: 'www.pekora.zip',
            path: '/apisite/catalog/v1/search/items?category=Collectibles&limit=5&sortType=3',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        };

        console.log('🔍 Запрос к API...');
        const data = await makeRequest(apiOptions);
        
        if (data && data.data && data.data.length > 0) {
            const newestItem = data.data[0];
            console.log('✅ Получены данные, первый товар ID:', newestItem.id);

            if (newestItem && newestItem.id) {
                // Первый запуск - сохраняем ID
                if (!lastItemId) {
                    console.log(`📝 Первый запуск! Сохраняем ID: ${newestItem.id}`);
                    saveLastItemId(newestItem.id);
                    return;
                }

                // Проверяем новый товар
                if (newestItem.id.toString() !== lastItemId) {
                    console.log(`🎉 ОБНАРУЖЕН НОВЫЙ ТОВАР!`);
                    console.log(`📋 Старый ID: ${lastItemId} → Новый ID: ${newestItem.id}`);

                    // Получаем детали
                    console.log('🔄 Получаем детальную информацию...');
                    const detailedItems = await getItemDetails([newestItem.id]);
                    const fullItemData = detailedItems[0] || newestItem;

                    console.log(`📦 Название: ${fullItemData.name || 'Нет названия'}`);
                    console.log(`💰 Цена: ${fullItemData.price || 'Бесплатно'}`);

                    // Отправляем уведомление
                    console.log('📤 Отправляем уведомление в Discord...');
                    const success = await sendDiscordNotification(fullItemData);
                    
                    if (success) {
                        saveLastItemId(newestItem.id);
                        console.log(`✅ Мониторинг обновлен! Новый ID: ${newestItem.id}`);
                    } else {
                        console.log('❌ Не удалось отправить уведомление, ID не обновлен');
                    }
                } else {
                    console.log('✅ Новых товаров нет');
                }
            }
        } else {
            console.log('❌ В ответе API нет данных о товарах');
        }
    } catch (error) {
        console.log('❌ Ошибка мониторинга:', error.message);
    }
    
    console.log('🏁 Проверка завершена');
}

// Запуск
monitor().catch(error => {
    console.error('💥 Критическая ошибка:', error);
    process.exit(1);
});
