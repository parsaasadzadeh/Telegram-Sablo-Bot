const Transaction        = require('../models/Transaction');
const TelegramLink       = require('../models/TelegramLink');
const TelegramReminderLog = require('../models/TelegramReminderLog');
const { sendMessage }    = require('./telegramService');

const IRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000; // ایران UTC+3:30 (بدون ساعت تابستانی)
const DAY_MS         = 24 * 60 * 60 * 1000;
const BATCH_SIZE     = 10; // همزمان 10 پیام — برای ماندن در timeout Vercel

const OFFSETS = [
    { days: 0, type: 'TG_DUE_TODAY', heading: '⏰ امروز موعد پرداخت قسط شماست' },
    { days: 1, type: 'TG_DUE_1DAY',  heading: '🔔 فردا موعد پرداخت قسط شماست' },
    { days: 2, type: 'TG_DUE_2DAYS', heading: '🔔 ۲ روز دیگه موعد پرداخت قسط شماست' },
];

/** بازه‌ی «یک روز به وقت ایران»، offsetDays روز از امروز جلوتر */
function getIranDayRange(offsetDays) {
    const iranNow = new Date(Date.now() + IRAN_OFFSET_MS);
    const startMs =
        Date.UTC(
            iranNow.getUTCFullYear(),
            iranNow.getUTCMonth(),
            iranNow.getUTCDate() + offsetDays
        ) - IRAN_OFFSET_MS;
    return { start: new Date(startMs), end: new Date(startMs + DAY_MS - 1) };
}

const fmtAmount = (n) => Number(n).toLocaleString('fa-IR');

function buildMessage(heading, items) {
    const lines = items.map((i) => `• ${i.title} — ${fmtAmount(i.amount)} تومان`);
    return `${heading}\n\n${lines.join('\n')}`;
}

async function processGroup(group, stats) {
    // اول «رزرو» می‌کنیم — unique index از ارسال تکراری جلوگیری می‌کند
    const claimed = [];
    for (const item of group.items) {
        try {
            await TelegramReminderLog.create({
                transactionId: item._id,
                reminderType:  group.type,
            });
            claimed.push(item);
        } catch (err) {
            if (err.code !== 11000) throw err;
            stats.skipped++;
        }
    }
    if (!claimed.length) return;

    try {
        await sendMessage(group.chatId, buildMessage(group.heading, claimed));
        stats.sent++;
    } catch (err) {
        stats.failed++;
        console.error(
            `❌ Telegram send failed (chat ${group.chatId}):`,
            err.response?.description || err.message
        );

        // کاربر بات را بلاک کرده یا چت حذف شده → اتصال را پاک کن، دیگر تلاش نکن
        const code = err.response?.error_code;
        if (code === 403 || (code === 400 && /chat not found/i.test(err.response?.description || ''))) {
            await TelegramLink.deleteMany({ chatId: group.chatId });
            stats.unlinked++;
            return;
        }

        // خطای موقت: رزرو را برمی‌گردانیم تا اجرای بعدی دوباره تلاش کند
        await TelegramReminderLog.deleteMany({
            transactionId: { $in: claimed.map((i) => i._id) },
            reminderType:  group.type,
        });
    }
}

async function runTelegramReminders() {
    const stats  = { checked: 0, groups: 0, sent: 0, failed: 0, skipped: 0, noLink: 0, unlinked: 0 };
    const ranges = OFFSETS.map((o) => ({ ...o, ...getIranDayRange(o.days) }));

    const installments = await Transaction.find({
        type:    'INSTALLMENT',
        isPaid:  false,
        dueDate: { $gte: ranges[0].start, $lte: ranges[ranges.length - 1].end },
    }).lean();

    stats.checked = installments.length;
    if (!installments.length) return stats;

    const userIds    = [...new Set(installments.map((i) => String(i.userId)))];
    const links      = await TelegramLink.find({ userId: { $in: userIds } }).lean();
    const chatByUser = new Map(links.map((l) => [String(l.userId), l.chatId]));

    // گروه‌بندی: یه پیام برای هر (کاربر × نوع یادآوری)
    const groups = new Map();
    for (const inst of installments) {
        const chatId = chatByUser.get(String(inst.userId));
        if (!chatId) { stats.noLink++; continue; }

        const t     = new Date(inst.dueDate).getTime();
        const range = ranges.find((r) => t >= r.start.getTime() && t <= r.end.getTime());
        if (!range) continue;

        const key = `${inst.userId}|${range.type}`;
        if (!groups.has(key))
            groups.set(key, { chatId, type: range.type, heading: range.heading, items: [] });
        groups.get(key).items.push(inst);
    }

    const list   = [...groups.values()];
    stats.groups = list.length;

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
        const batch   = list.slice(i, i + BATCH_SIZE);
        const settled = await Promise.allSettled(batch.map((g) => processGroup(g, stats)));
        settled.forEach((r) => {
            if (r.status === 'rejected') {
                stats.failed++;
                console.error('❌ خطای پردازش گروه:', r.reason?.message || r.reason);
            }
        });
    }

    return stats;
}

module.exports = { runTelegramReminders, getIranDayRange };
