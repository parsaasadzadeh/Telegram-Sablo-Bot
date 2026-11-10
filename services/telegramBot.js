const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');

const Transaction             = require('../models/Transaction');
const Cheque                  = require('../models/Cheque');
const Obligation              = require('../models/Obligation');
const User                    = require('../models/User');
const TelegramLink            = require('../models/TelegramLink');
const TelegramLoginSession    = require('../models/TelegramLoginSession');
const TelegramProcessedUpdate = require('../models/TelegramProcessedUpdate');
const { requestOtp, verifyOtp } = require('./sabloApiService');
const { fmtMoney, fmtDate }     = require('../utils/format');

// ─── ثابت‌ها ────────────────────────────────────────────────────────────────

const SESSION_TTL_MS     = 60 * 60 * 1000; // 1 ساعت
const RESEND_COOLDOWN_MS = 60 * 1000;      // 60 ثانیه بین پیامک‌ها
const MAX_SENDS          = 5;              // حداکثر OTP در هر session

const TXT_UPCOMING = '📋 سررسیدهای پیش رو';
const TXT_UPCOMING_LEGACY = '📋 اقساط پیش رو'; // کیبوردهای قدیمی کاربران
const TXT_UNLINK   = '🔕 قطع اتصال';

const MAIN_KEYPAD = Markup.keyboard([[TXT_UPCOMING], [TXT_UNLINK]]).resize();

const MSG_ASK_PHONE = [
    'سلام 👋 به ربات یادآور اقساط سابلو خوش اومدی.',
    '',
    'برای ورود، شماره‌ای که با اون تو اپ ثبت‌نام کردی رو بفرست.',
    'مثلاً: 09121234567',
].join('\n');

// ─── کمک‌کننده‌ها ────────────────────────────────────────────────────────────

const toEnglishDigits = (s) =>
    String(s || '')
        .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
        .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

/** هر فرمتی از شماره ایرانی → 09xxxxxxxxx */
function normalizePhone(input) {
    let p = toEnglishDigits(input).replace(/[\s\-()+]/g, '');
    if (p.startsWith('0098')) p = '0' + p.slice(4);
    else if (p.startsWith('98')) p = '0' + p.slice(2);
    else if (/^9\d{9}$/.test(p)) p = '0' + p;
    return /^09\d{9}$/.test(p) ? p : null;
}

// ─── مدیریت Session ──────────────────────────────────────────────────────────

function getSession(chatId) {
    return TelegramLoginSession.findOneAndUpdate(
        { chatId },
        { $set: { expiresAt: new Date(Date.now() + SESSION_TTL_MS) } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

function backToPhoneStep(chatId) {
    return TelegramLoginSession.updateOne(
        { chatId },
        { $set: { step: 'AWAIT_PHONE' }, $unset: { phone: 1 } }
    );
}

// ─── مرحله دریافت شماره ─────────────────────────────────────────────────────

async function receivePhone(ctx, session, text) {
    const chatId = String(ctx.chat.id);
    const phone  = normalizePhone(text);

    if (!phone) {
        return ctx.reply('⚠️ شماره معتبر نیست. شماره‌ی موبایلت رو مثل 09121234567 بفرست.');
    }
    if (session.sendCount >= MAX_SENDS) {
        return ctx.reply('⛔ تعداد درخواست‌ها زیاد شد. یه ساعت دیگه دوباره امتحان کن.');
    }
    if (session.lastSentAt && Date.now() - session.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
        return ctx.reply('⏳ چند لحظه صبر کن و بعد دوباره امتحان کن.');
    }

    const result = await requestOtp(phone);
    if (!result.success) {
        return ctx.reply(
            `❌ ${result.error || 'ارسال کد ناموفق بود. چند دقیقه دیگه دوباره امتحان کن.'}`
        );
    }

    await TelegramLoginSession.updateOne(
        { chatId },
        {
            $set: { step: 'AWAIT_OTP', phone, lastSentAt: new Date() },
            $inc: { sendCount: 1 },
        }
    );

    return ctx.reply(
        '📩 کد ۵ رقمی برات پیامک شد. همین‌جا بفرستش.\n' +
        '(اگه شماره رو اشتباه زدی، شماره‌ی درست رو دوباره بفرست.)',
        Markup.removeKeyboard()
    );
}

// ─── مرحله دریافت کد OTP ────────────────────────────────────────────────────

async function receiveOtp(ctx, session, text) {
    const chatId = String(ctx.chat.id);

    // اگه کاربر به‌جای کد یه شماره فرستاد → می‌خواد شماره رو عوض کنه
    if (normalizePhone(text)) return receivePhone(ctx, session, text);

    const code = toEnglishDigits(text).trim();
    if (!/^\d{4,6}$/.test(code)) {
        return ctx.reply('⚠️ کد پیامک‌شده رو بفرست.');
    }

    const result = await verifyOtp(session.phone, code);
    if (!result.success) {
        return ctx.reply(`❌ ${result.error || 'کد اشتباهه یا منقضی شده. دوباره امتحان کن.'}`);
    }

    // ─── ورود موفق ───────────────────────────────────────────────────────────
    const userId = new mongoose.Types.ObjectId(result.userId);

    // اتصال دائمی: هر userId یه chatId، هر chatId یه userId
    await TelegramLink.deleteMany({ chatId, userId: { $ne: userId } });
    await TelegramLink.findOneAndUpdate(
        { userId },
        { chatId, token: result.token },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await TelegramLoginSession.deleteOne({ chatId });

    return ctx.reply(
        '✅ وارد شدی! از این به بعد یادآوری اقساط، چک‌ها، طلب و بدهی و هشدار بودجه رو همین‌جا برات می‌فرستم.\n' +
        'برای دیدن سررسیدهای پیش رو از دکمه پایین استفاده کن.',
        MAIN_KEYPAD
    );
}

// ─── بعد از ورود ────────────────────────────────────────────────────────────

async function unlink(ctx) {
    const chatId = String(ctx.chat.id);
    await TelegramLink.deleteMany({ chatId });
    await TelegramLoginSession.deleteOne({ chatId });

    return ctx.reply(
        '🔕 اتصال قطع شد. هر وقت خواستی /start بزن و دوباره وارد شو.',
        Markup.removeKeyboard()
    );
}

async function sendUpcoming(ctx, link) {
    const user  = await User.findById(link.userId).select('currency').lean();
    const money = (rial) => fmtMoney(rial, user?.currency);
    const LIMIT = 5;

    const [inst, chq, obl] = await Promise.all([
        Transaction.find({ userId: link.userId, type: 'INSTALLMENT', isPaid: false })
            .sort({ dueDate: 1 }).limit(LIMIT).lean(),
        Cheque.find({ userId: link.userId, status: 'PENDING' })
            .sort({ dueDate: 1 }).limit(LIMIT).lean(),
        Obligation.find({
            userId: link.userId, dueDate: { $ne: null },
            $expr: { $lt: [{ $ifNull: ['$paidAmount', 0] }, '$amount'] },
        }).sort({ dueDate: 1 }).limit(LIMIT).lean(),
    ]);

    const sections = [];
    if (inst.length) {
        sections.push('💳 اقساط:\n' + inst.map(
            (i) => `• ${i.title}\n   ${money(i.amount)} — سررسید ${fmtDate(i.dueDate)}`).join('\n'));
    }
    if (chq.length) {
        sections.push('🧾 چک‌ها:\n' + chq.map((c) => {
            const dir = c.direction === 'RECEIVABLE' ? 'دریافتی' : 'پرداختی';
            const who = c.counterparty ? ` — ${c.counterparty}` : '';
            return `• ${dir}${who}\n   ${money(c.amount)} — سررسید ${fmtDate(c.dueDate)}`;
        }).join('\n'));
    }
    if (obl.length) {
        sections.push('🤝 طلب و بدهی:\n' + obl.map((o) => {
            const kind = o.kind === 'CREDIT' ? 'طلب از' : 'بدهی به';
            const left = Math.max(0, (o.amount || 0) - (o.paidAmount || 0));
            return `• ${kind} ${o.person}\n   ${money(left)} — سررسید ${fmtDate(o.dueDate)}`;
        }).join('\n'));
    }

    if (!sections.length) return ctx.reply('🎉 سررسید باز و پرداخت‌نشده‌ای نداری.');
    return ctx.reply(`📋 سررسیدهای پیش رو:\n\n${sections.join('\n\n')}`);
}

// ─── مسیریابی اصلی پیام‌ها ──────────────────────────────────────────────────

async function route(ctx, text, { isStart = false } = {}) {
    const chatId = String(ctx.chat.id);
    const link   = await TelegramLink.findOne({ chatId }).lean();

    // کاربر قبلاً وارد شده
    if (link) {
        if (text === TXT_UPCOMING || text === TXT_UPCOMING_LEGACY) return sendUpcoming(ctx, link);
        if (text === TXT_UNLINK)   return unlink(ctx);
        return ctx.reply('✅ حسابت وصله. از دکمه‌های پایین استفاده کن.', MAIN_KEYPAD);
    }

    // کاربر هنوز وارد نشده
    const session = await getSession(chatId);

    if (isStart) {
        await backToPhoneStep(chatId);
        return ctx.reply(MSG_ASK_PHONE, Markup.removeKeyboard());
    }
    if (session.step === 'AWAIT_OTP') return receiveOtp(ctx, session, text);
    return receivePhone(ctx, session, text);
}

// ─── ساخت بات Telegraf ──────────────────────────────────────────────────────

function createBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN تنظیم نشده');

    const bot = new Telegraf(token);

    // فقط چت خصوصی
    bot.use((ctx, next) => (ctx.chat?.type === 'private' ? next() : undefined));

    // جلوگیری از پردازش دوباره‌ی یک update (retry تلگرام)
    bot.use(async (ctx, next) => {
        const id = ctx.update?.update_id;
        if (id !== undefined) {
            try {
                await TelegramProcessedUpdate.create({ updateId: id });
            } catch (err) {
                if (err.code === 11000) return; // قبلاً پردازش شده
                throw err;
            }
        }
        return next();
    });

    bot.start((ctx) => route(ctx, '/start', { isStart: true }));

    bot.command('stop', async (ctx) => unlink(ctx));

    bot.on('text', (ctx) => route(ctx, (ctx.message.text || '').trim()));

    bot.catch((err, ctx) => {
        console.error(`❌ Telegram handler error (update ${ctx.update?.update_id}):`,
            err.response?.description || err.message);
    });

    return bot;
}

// singleton — روی Vercel بین invocation های گرم استفاده مجدد می‌شود
let botInstance;
function getBot() {
    if (!botInstance) botInstance = createBot();
    return botInstance;
}

/** ورودی webhook: بدنه‌ی update خام تلگرام */
function handleUpdate(update) {
    return getBot().handleUpdate(update);
}

module.exports = { getBot, handleUpdate, normalizePhone };