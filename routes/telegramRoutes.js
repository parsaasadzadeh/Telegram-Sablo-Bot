const express = require('express');

const connectDB                  = require('../config/db');
const { handleUpdate }           = require('../services/telegramBot');
const { runTelegramReminders }   = require('../services/telegramReminders');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Webhook تلگرام
// آدرس شامل TELEGRAM_WEBHOOK_SECRET است، و تلگرام همان مقدار را در هدر
// X-Telegram-Bot-Api-Secret-Token هم می‌فرستد (با set-webhook تنظیم می‌شود).
// حتی در صورت خطا 200 برمی‌گردانیم تا تلگرام بی‌جهت retry نکند.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/telegram/webhook/:secret', async (req, res) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret || req.params.secret !== secret) return res.sendStatus(404);

    const header = req.get('x-telegram-bot-api-secret-token');
    if (header !== secret) return res.sendStatus(404);

    // قبل از پاسخ دادن کار را تمام می‌کنیم (Vercel بعد از res ممکن است freeze کند)
    try {
        await connectDB();
        await handleUpdate(req.body);
    } catch (err) {
        console.error('❌ Telegram webhook error:', err.response?.description || err.message);
    }

    res.sendStatus(200);
});

// ─────────────────────────────────────────────────────────────────────────────
// Cron — idempotent است و می‌شود هر ۱۵ دقیقه صدایش زد (برای رسیدن سریع هشدار بودجه):
//   • Vercel Cron روزانه ۴:۳۰ UTC (= ۸ صبح ایران) → یادآوری سررسیدها
//   • اختیاری: cron-job.org / GitHub Actions هر ۱۵ دقیقه با هدر Authorization: Bearer <CRON_SECRET>
//   • ?force=1 → سررسیدها را بدون توجه به ساعت اجرا می‌کند (برای تست)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/cron/telegram-reminders', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        await connectDB();
        const stats = await runTelegramReminders({ force: req.query.force === '1' });
        console.log('✅ Telegram reminders:', stats);
        res.status(200).json({ ok: true, stats });
    } catch (error) {
        console.error('❌ Telegram cron error:', error.message);
        res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;
