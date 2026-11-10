// دیتابیس سابلو همه‌ی مبالغ را «ریال» نگه می‌دارد (ر.ک. budgetAlerts.js و aiController.js در بک‌اند).
// نمایش به کاربر بر اساس User.currency است: IRT (پیش‌فرض) = تومان ، IRR = ریال.
const RIAL_PER_TOMAN = 10;

const fa = (n) => Number(n).toLocaleString('fa-IR');

function fmtMoney(rial, currency = 'IRT') {
    const n = Number(rial) || 0;
    return currency === 'IRR' ? `${fa(Math.round(n))} ریال` : `${fa(Math.round(n / RIAL_PER_TOMAN))} تومان`;
}

const fmtDate = (d) => new Date(d).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' });

module.exports = { RIAL_PER_TOMAN, fmtMoney, fmtDate, fa };
