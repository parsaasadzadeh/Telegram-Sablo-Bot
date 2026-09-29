// تست لوکال — بدون webhook و بدون tunnel (long polling)
// اجرا:  npm run dev
require('dotenv').config();
const mongoose = require('mongoose');
const { getBot } = require('../services/telegramBot');

(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB وصل شد.');

    const bot = getBot();

    // اگر webhook فعال باشد، polling کار نمی‌کند
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    await bot.telegram.setMyCommands([
        { command: 'start', description: 'شروع و ورود به حساب' },
        { command: 'stop',  description: 'قطع اتصال از ربات' },
    ]);

    const me = await bot.telegram.getMe();
    console.log(`👂 @${me.username} آماده‌ست — برو تو تلگرام بهش پیام بده (Ctrl+C برای خروج)`);
    console.log('⚠️  بعد از تست، برای برگشت به حالت production یک بار npm run set-webhook بزن.');

    process.once('SIGINT',  () => { bot.stop('SIGINT');  mongoose.disconnect(); });
    process.once('SIGTERM', () => { bot.stop('SIGTERM'); mongoose.disconnect(); });

    await bot.launch({ allowedUpdates: ['message'] });
})().catch((e) => {
    console.error('❌', e.response?.description || e.message);
    process.exit(1);
});
