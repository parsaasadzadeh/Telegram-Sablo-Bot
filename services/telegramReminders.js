const Transaction         = require('../models/Transaction');
const Cheque              = require('../models/Cheque');
const Obligation          = require('../models/Obligation');
const Notification        = require('../models/Notification');
const User                = require('../models/User');
const TelegramLink        = require('../models/TelegramLink');
const TelegramReminderLog = require('../models/TelegramReminderLog');
const { sendMessage }     = require('./telegramService');
const { fmtMoney }        = require('../utils/format');
const { DAY_MS, iranDayDiff, iranHour, iranDateKey, getIranDayRange } = require('../utils/iranTime');

const BATCH_SIZE      = 10;                                     // همزمان ۱۰ پیام (برای ماندن در timeout)
const MAX_PER_MESSAGE = 20;                                     // سقف آیتم در هر پیام
const OVERDUE_DAYS    = 7;                                      // تا ۷ روز بعد از سررسید، یک‌بار «عقب‌افتاده» اعلام می‌شود
const DAILY_HOUR      = Number(process.env.REMINDER_HOUR ?? 8); // یادآوری سررسیدها از این ساعتِ ایران به بعد
const BUDGET_LOOKBACK = 48 * 60 * 60 * 1000;                    // اعلان بودجه‌ی قدیمی‌تر از ۴۸ ساعت فوروارد نمی‌شود

// ─────────────────────────────────────────────────────────────────────────────
// هر «منبع» (source) یک تابع collect دارد که آیتم‌های قابل ارسال را برمی‌گرداند:
//   { userId, refId, bucketId, logType, heading, line, sort }
//   - refId + logType → کلید یکتای جلوگیری از ارسال تکراری (TelegramReminderLog)
//   - bucketId        → آیتم‌های یک کاربر با bucketId یکسان در «یک پیام» جمع می‌شوند
// کلید لاگ شامل تاریخ سررسید هم هست؛ پس اگر کاربر سررسید را عوض کند، یادآوری جدید ارسال می‌شود.
// ─────────────────────────────────────────────────────────────────────────────

function queryWindow(maxAhead) {
    const now = Date.now();
    return { $gte: new Date(now - (OVERDUE_DAYS + 1) * DAY_MS), $lte: new Date(now + (maxAhead + 1) * DAY_MS) };
}

const when = (d) => (d === 0 ? 'امروز' : d === 1 ? 'فردا' : `${d.toLocaleString('fa-IR')} روز دیگه`);

// ─── اقساط ──────────────────────────────────────────────────────────────────
const LEGACY_INST_TYPE = { 0: 'TG_DUE_TODAY', 1: 'TG_DUE_1DAY', 2: 'TG_DUE_2DAYS' }; // سازگار با لاگ‌های قبلی

const installments = {
    name: 'installments', daily: true,
    async collect({ userIds }) {
        const docs = await Transaction.find({
            userId: { $in: userIds }, type: 'INSTALLMENT', isPaid: false, dueDate: queryWindow(2),
        }).lean();

        const out = [];
        for (const d of docs) {
            const diff    = iranDayDiff(d.dueDate);
            const overdue = diff < 0 && diff >= -OVERDUE_DAYS;
            if (!overdue && !(diff >= 0 && diff <= 2)) continue;
            out.push({
                userId: d.userId, refId: d._id, sort: new Date(d.dueDate).getTime(),
                bucketId: overdue ? 'INST_OD' : `INST_D${diff}`,
                logType:  overdue ? `TG_INST_OD_${iranDateKey(d.dueDate)}` : LEGACY_INST_TYPE[diff],
                heading:  overdue ? '❗ قسط عقب‌افتاده داری (هنوز پرداخت نشده)'
                                  : `${diff === 0 ? '⏰' : '🔔'} ${when(diff)} موعد پرداخت قسط شماست`,
                line: (money) => `• ${d.title} — ${money(d.amount)}`,
            });
        }
        return out;
    },
};

// ─── چک‌ها ──────────────────────────────────────────────────────────────────
const CHEQUE_OFFSETS = [0, 1, 3]; // ۳ روز قبل: فرصت تأمین موجودی حساب

const chequeHeading = (dir, diff) => {
    if (diff < 0) {
        return dir === 'PAYABLE'
            ? '❗ چک پرداختیِ سررسیدگذشته داری (هنوز پاس نشده)'
            : '❗ چک دریافتیِ سررسیدگذشته داری (هنوز وصول نشده)';
    }
    if (dir === 'PAYABLE') {
        return diff === 0
            ? '🧾 امروز سررسید چک پرداختی‌ته — موجودی حسابت رو چک کن'
            : `🔔 ${when(diff)} سررسید چک پرداختی‌ته — حسابت رو آماده کن`;
    }
    return diff === 0 ? '💰 امروز موعد وصول چک دریافتی‌ته' : `🔔 ${when(diff)} موعد وصول چک دریافتی‌ته`;
};

function chequeLine(c, money) {
    const who  = c.counterparty ? (c.direction === 'PAYABLE' ? ` به ${c.counterparty}` : ` از ${c.counterparty}`) : '';
    const meta = [c.bank, c.chequeNumber && `شماره ${c.chequeNumber}`].filter(Boolean).join('، ');
    return `• ${money(c.amount)}${who}${meta ? ` (${meta})` : ''}`;
}

const cheques = {
    name: 'cheques', daily: true,
    async collect({ userIds }) {
        const docs = await Cheque.find({
            userId: { $in: userIds }, status: 'PENDING', dueDate: queryWindow(Math.max(...CHEQUE_OFFSETS)),
        }).lean();

        const out = [];
        for (const c of docs) {
            const diff    = iranDayDiff(c.dueDate);
            const overdue = diff < 0 && diff >= -OVERDUE_DAYS;
            if (!overdue && !CHEQUE_OFFSETS.includes(diff)) continue;
            const dir = c.direction === 'RECEIVABLE' ? 'RECEIVABLE' : 'PAYABLE';
            out.push({
                userId: c.userId, refId: c._id, sort: new Date(c.dueDate).getTime(),
                bucketId: overdue ? `CHQ_OD_${dir}` : `CHQ_D${diff}_${dir}`,
                logType:  `TG_CHQ_${overdue ? 'OD' : `D${diff}`}_${iranDateKey(c.dueDate)}`,
                heading:  chequeHeading(dir, diff),
                line: (money) => chequeLine(c, money),
            });
        }
        return out;
    },
};

// ─── طلب و بدهی ─────────────────────────────────────────────────────────────
const OBL_OFFSETS = [0, 1, 2];

const oblHeading = (kind, diff) => {
    if (diff < 0) {
        return kind === 'DEBT' ? '❗ بدهیِ سررسیدگذشته داری (هنوز تسویه نشده)'
                               : '❗ طلبِ سررسیدگذشته داری (هنوز دریافت نشده)';
    }
    if (kind === 'DEBT') return `${diff === 0 ? '⏰' : '🔔'} ${when(diff)} سررسید بدهی‌ته`;
    return `${diff === 0 ? '💰' : '🔔'} ${when(diff)} موعد دریافت طلبته`;
};

const obligations = {
    name: 'obligations', daily: true,
    async collect({ userIds }) {
        const docs = await Obligation.find({
            userId: { $in: userIds },
            dueDate: queryWindow(Math.max(...OBL_OFFSETS)),
            $expr: { $lt: [{ $ifNull: ['$paidAmount', 0] }, '$amount'] }, // هنوز کامل تسویه نشده
        }).lean();

        const out = [];
        for (const o of docs) {
            const diff    = iranDayDiff(o.dueDate);
            const overdue = diff < 0 && diff >= -OVERDUE_DAYS;
            if (!overdue && !OBL_OFFSETS.includes(diff)) continue;
            const kind      = o.kind === 'CREDIT' ? 'CREDIT' : 'DEBT';
            const remaining = Math.max(0, (o.amount || 0) - (o.paidAmount || 0));
            out.push({
                userId: o.userId, refId: o._id, sort: new Date(o.dueDate).getTime(),
                bucketId: overdue ? `OBL_OD_${kind}` : `OBL_D${diff}_${kind}`,
                logType:  `TG_OBL_${overdue ? 'OD' : `D${diff}`}_${iranDateKey(o.dueDate)}`,
                heading:  oblHeading(kind, diff),
                line: (money) => `• ${o.person}${o.title ? ` — ${o.title}` : ''} — ${money(remaining)}`,
            });
        }
        return out;
    },
};

// ─── بودجه (فوروارد اعلان‌های خود بک‌اند) ───────────────────────────────────
// بک‌اند بعد از ثبت هر هزینه، اگر مصرف دسته به ۸۰٪ یا ۱۰۰٪ برسد یک Notification با budgetLevel
// می‌سازد (و lastAlertLevel را اتمیک روی Budget ست می‌کند). ربات همان را یک‌بار به تلگرام می‌فرستد؛
// پس منطق بودجه دو جا تکرار نمی‌شود و متن با اپ یکی است.
const budgets = {
    name: 'budgets', daily: false, // هر اجرا؛ منتظر ساعت ۸ نمی‌ماند
    async collect({ userIds, linkByUser }) {
        const docs = await Notification.find({
            userId: { $in: userIds },
            budgetLevel: { $in: [80, 100] },
            createdAt: { $gte: new Date(Date.now() - BUDGET_LOOKBACK) },
        }).lean();

        const out = [];
        for (const n of docs) {
            const link = linkByUser.get(String(n.userId));
            // اعلان‌های قبل از وصل شدن کاربر به تلگرام فوروارد نمی‌شن
            if (link?.createdAt && new Date(n.createdAt) < new Date(link.createdAt)) continue;
            out.push({
                userId: n.userId, refId: n._id, sort: new Date(n.createdAt).getTime(),
                bucketId: `BUDGET_${n._id}`, logType: 'TG_BUDGET_FWD',
                heading: n.title || '📊 هشدار بودجه',
                raw: true, // متن آماده است (مبلغ‌ها را بک‌اند به تومان تبدیل کرده)
                line: () => n.message,
            });
        }
        return out;
    },
};

const SOURCES = [installments, cheques, obligations, budgets];

// ─────────────────────────────────────────────────────────────────────────────

function buildMessage(group, money) {
    if (group.raw) return `${group.heading}\n\n${group.items[0].line(money)}`;
    const items = [...group.items].sort((a, b) => a.sort - b.sort);
    const shown = items.slice(0, MAX_PER_MESSAGE).map((i) => i.line(money));
    const extra = items.length - shown.length;
    if (extra > 0) shown.push(`… و ${extra.toLocaleString('fa-IR')} مورد دیگه`);
    return `${group.heading}\n\n${shown.join('\n')}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ارسال با یک‌بار تلاش مجدد روی rate limit تلگرام (429) */
async function sendWithRetry(chatId, text) {
    try {
        return await sendMessage(chatId, text);
    } catch (err) {
        const wait = err.response?.parameters?.retry_after;
        if (err.response?.error_code === 429 && wait && wait <= 5) {
            await sleep((wait + 0.5) * 1000);
            return sendMessage(chatId, text);
        }
        throw err;
    }
}

async function processGroup(group, stats, currencyByUser) {
    // اول «رزرو»: unique index از ارسال تکراری جلوگیری می‌کند
    const claimed = [];
    for (const item of group.items) {
        try {
            await TelegramReminderLog.create({ transactionId: item.refId, reminderType: item.logType });
            claimed.push(item);
        } catch (err) {
            if (err.code !== 11000) throw err;
            stats.skipped++;
        }
    }
    if (!claimed.length) return;

    const money = (rial) => fmtMoney(rial, currencyByUser.get(String(group.userId)));
    try {
        await sendWithRetry(group.chatId, buildMessage({ ...group, items: claimed }, money));
        stats.sent++;
    } catch (err) {
        stats.failed++;
        console.error(`❌ Telegram send failed (chat ${group.chatId}):`, err.response?.description || err.message);

        // کاربر بات را بلاک کرده یا چت حذف شده → اتصال را پاک کن، دیگر تلاش نکن
        const code = err.response?.error_code;
        if (code === 403 || (code === 400 && /chat not found/i.test(err.response?.description || ''))) {
            await TelegramLink.deleteMany({ chatId: group.chatId });
            stats.unlinked++;
            return;
        }

        // خطای موقت: رزرو را برمی‌گردانیم تا اجرای بعدی دوباره تلاش کند
        await TelegramReminderLog.deleteMany({
            $or: claimed.map((i) => ({ transactionId: i.refId, reminderType: i.logType })),
        });
    }
}

/**
 * idempotent است؛ می‌شود هر ۱۵ دقیقه صدایش زد:
 *   • اعلان‌های بودجه در هر اجرا فوروارد می‌شن،
 *   • یادآوری سررسیدها (قسط/چک/طلب‌وبدهی) فقط بعد از ساعت REMINDER_HOUR (پیش‌فرض ۸ صبح ایران)، یک‌بار در روز.
 * @param {{ force?: boolean }} opts  force=true → سررسیدها بدون توجه به ساعت (برای تست)
 */
async function runTelegramReminders({ force = false } = {}) {
    const stats = { collected: {}, groups: 0, sent: 0, failed: 0, skipped: 0, unlinked: 0, dailyRan: false };

    const links = await TelegramLink.find({}).select('userId chatId createdAt').lean();
    if (!links.length) return stats;

    const linkByUser = new Map(links.map((l) => [String(l.userId), l]));
    const userIds    = links.map((l) => l.userId);
    const runDaily   = force || iranHour() >= DAILY_HOUR;
    stats.dailyRan   = runDaily;

    const groups = new Map();
    for (const src of SOURCES) {
        if (src.daily && !runDaily) continue;
        let items;
        try {
            items = await src.collect({ userIds, linkByUser });
        } catch (err) {
            stats.failed++; // خرابی یک منبع نباید بقیه را از کار بیندازد
            console.error(`❌ منبع ${src.name}:`, err.message);
            continue;
        }
        stats.collected[src.name] = items.length;

        for (const it of items) {
            const link = linkByUser.get(String(it.userId));
            if (!link) continue;

            const key = `${it.userId}|${it.bucketId}`;
            if (!groups.has(key)) {
                groups.set(key, { userId: it.userId, chatId: link.chatId, heading: it.heading, raw: !!it.raw, items: [] });
            }
            groups.get(key).items.push(it);
        }
    }

    const list = [...groups.values()];
    stats.groups = list.length;
    if (!list.length) return stats;

    // ارز نمایشی کاربرانی که پیام دارند (IRT → تومان، IRR → ریال)
    const users = await User.find({ _id: { $in: [...new Set(list.map((g) => String(g.userId)))] } })
        .select('currency').lean();
    const currencyByUser = new Map(users.map((u) => [String(u._id), u.currency || 'IRT']));

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
        const settled = await Promise.allSettled(
            list.slice(i, i + BATCH_SIZE).map((g) => processGroup(g, stats, currencyByUser))
        );
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
