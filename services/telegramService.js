const { Telegram } = require('telegraf');

// یک کلاینت سبک برای ارسال پیام از بیرون از handler ها (کرون، یادآوری‌ها)
let client;
function getTelegram() {
    if (!client) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) throw new Error('TELEGRAM_BOT_TOKEN تنظیم نشده');
        client = new Telegram(token);
    }
    return client;
}

/** ارسال پیام ساده یا همراه با کیبورد (extra همان گزینه‌های Telegraf است) */
function sendMessage(chatId, text, extra = {}) {
    return getTelegram().sendMessage(chatId, text, extra);
}

module.exports = { getTelegram, sendMessage };
