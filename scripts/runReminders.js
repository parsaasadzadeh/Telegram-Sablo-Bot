// تست لوکال یادآوری‌ها (همان کاری که Vercel Cron می‌کند)
// اجرا:           npm run remind
// ریست لاگ‌ها:    npm run remind -- --reset
// بدون توجه به ساعت (سررسیدها): npm run remind -- --force
require('dotenv').config();
const mongoose             = require('mongoose');
const TelegramReminderLog  = require('../models/TelegramReminderLog');
const { runTelegramReminders, getIranDayRange } = require('../services/telegramReminders');

(async () => {
    await mongoose.connect(process.env.MONGO_URI);

    if (process.argv.includes('--reset')) {
        const r = await TelegramReminderLog.deleteMany({});
        console.log(`🧹 ${r.deletedCount} لاگ پاک شد`);
    }

    for (const d of [0, 1, 2, 3]) {
        const { start, end } = getIranDayRange(d);
        console.log(`بازه +${d} روز:`, start.toISOString(), '→', end.toISOString());
    }

    console.log('نتیجه:', await runTelegramReminders({ force: process.argv.includes('--force') }));
    await mongoose.disconnect();
})().catch((e) => {
    console.error('❌', e);
    process.exit(1);
});
