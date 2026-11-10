// ابزار زمان ایران (UTC+3:30 ثابت؛ ایران از ۱۴۰۱ ساعت تابستانی ندارد)
const IRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** شماره‌ی «روز تقویمی ایران» برای یک زمان (عدد صحیح، قابل مقایسه و تفریق) */
const iranDayNumber = (d = Date.now()) =>
    Math.floor((new Date(d).getTime() + IRAN_OFFSET_MS) / DAY_MS);

/** اختلاف روز تقویمی ایران: 0 = امروز، 1 = فردا، -1 = دیروز */
const iranDayDiff = (date, now = Date.now()) => iranDayNumber(date) - iranDayNumber(now);

/** ساعت فعلی ایران (۰ تا ۲۳) */
const iranHour = (now = Date.now()) =>
    new Date(new Date(now).getTime() + IRAN_OFFSET_MS).getUTCHours();

/** کلید تاریخ ایران به شکل YYYYMMDD (برای کلید یکتای لاگ یادآوری) */
function iranDateKey(date) {
    const d = new Date(new Date(date).getTime() + IRAN_OFFSET_MS);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

/** بازه‌ی «یک روز به وقت ایران»، offsetDays روز از امروز جلوتر (سازگار با نسخه‌ی قبل) */
function getIranDayRange(offsetDays) {
    const iranNow = new Date(Date.now() + IRAN_OFFSET_MS);
    const startMs =
        Date.UTC(iranNow.getUTCFullYear(), iranNow.getUTCMonth(), iranNow.getUTCDate() + offsetDays) -
        IRAN_OFFSET_MS;
    return { start: new Date(startMs), end: new Date(startMs + DAY_MS - 1) };
}

module.exports = { IRAN_OFFSET_MS, DAY_MS, iranDayNumber, iranDayDiff, iranHour, iranDateKey, getIranDayRange };
