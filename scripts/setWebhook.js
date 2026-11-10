// یک بار اجرا کن:  npm run set-webhook
require('dotenv').config();
const { getTelegram } = require('../services/telegramService');

(async () => {
    const base   = process.env.PUBLIC_BASE_URL;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!base || !secret) {
        throw new Error('PUBLIC_BASE_URL و TELEGRAM_WEBHOOK_SECRET رو تو .env بذار');
    }
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
        throw new Error('TELEGRAM_WEBHOOK_SECRET فقط می‌تواند شامل حروف انگلیسی، عدد، _ و - باشد');
    }

    const tg  = getTelegram();
    const url = `${base.replace(/\/$/, '')}/api/telegram/webhook/${secret}`;

    console.log('getMe:', JSON.stringify(await tg.getMe()));

    await tg.setWebhook(url, {
        secret_token:         secret,
        allowed_updates:      ['message'],
        drop_pending_updates: true,
    });

    await tg.setMyCommands([
        { command: 'start', description: 'شروع و ورود به حساب' },
        { command: 'stop',  description: 'قطع اتصال از ربات' },
    ]);

    console.log('✅ webhook ثبت شد →', url);
    console.log('ℹ️  وضعیت:', JSON.stringify(await tg.getWebhookInfo()));
})().catch((e) => {
    console.error('❌', e.response?.description || e.message);
    process.exit(1);
});
