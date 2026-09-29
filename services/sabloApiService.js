const axios = require('axios');

/**
 * ارتباط با بک‌اند سابلو برای ارسال و تأیید OTP.
 * تمام منطق SMS و رمزنگاری OTP در بک‌اند اصلی هندل می‌شود؛ ربات فقط proxy است.
 */

function getBase() {
    const base = process.env.SABLO_API_BASE_URL;
    if (!base) throw new Error('SABLO_API_BASE_URL تنظیم نشده');
    return base.replace(/\/$/, '');
}

const errMsg = (err) =>
    err.response?.data?.message || err.response?.data?.error || err.message;

/** POST /api/auth/request-otp { phone } */
async function requestOtp(phone) {
    if (process.env.DEV_SKIP_OTP === '1') {
        console.log(`🔑 [DEV] فرض کن OTP برای ${phone} ارسال شد`);
        return { success: true };
    }
    try {
        const { data } = await axios.post(
            `${getBase()}/api/auth/request-otp`,
            { phone },
            { headers: { 'Content-Type': 'application/json' }, timeout: 12000 }
        );
        return { success: true, message: data.message };
    } catch (err) {
        console.error('sabloApi requestOtp error:', errMsg(err));
        return { success: false, error: errMsg(err) };
    }
}

/** POST /api/auth/verify-otp { phone, code } → { token, user: { _id } } */
async function verifyOtp(phone, code) {
    if (process.env.DEV_SKIP_OTP === '1') {
        console.log(`🔑 [DEV] کد ${code} برای ${phone} تأیید شد (mock)`);
        return { success: true, token: 'dev-mock-token', userId: '000000000000000000000000' };
    }
    try {
        const { data } = await axios.post(
            `${getBase()}/api/auth/verify-otp`,
            { phone, code },
            { headers: { 'Content-Type': 'application/json' }, timeout: 12000 }
        );
        return {
            success: true,
            token:  data.token,
            userId: data.user?._id || data.user?.id,
        };
    } catch (err) {
        console.error('sabloApi verifyOtp error:', errMsg(err));
        return { success: false, error: errMsg(err) };
    }
}

module.exports = { requestOtp, verifyOtp };
