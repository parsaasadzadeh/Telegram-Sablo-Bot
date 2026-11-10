const mongoose = require('mongoose');

/**
 * وضعیت مکالمه‌ی «ورود» داخل بات.
 * فقط در مرحله‌ی ورود وجود دارد؛ بعد از موفقیت یا بعد از 1 ساعت خودکار پاک می‌شود.
 *
 *   AWAIT_PHONE → کاربر باید شماره بفرستد
 *   AWAIT_OTP   → OTP ارسال شده، منتظر کد
 */
const schema = new mongoose.Schema({
    chatId:     { type: String, required: true, unique: true },
    step:       { type: String, enum: ['AWAIT_PHONE', 'AWAIT_OTP'], default: 'AWAIT_PHONE' },
    phone:      String,
    sendCount:  { type: Number, default: 0 },
    lastSentAt: Date,
    expiresAt:  { type: Date, required: true, index: { expires: 0 } }, // MongoDB TTL
});

module.exports =
    mongoose.models.TelegramLoginSession ||
    mongoose.model('TelegramLoginSession', schema);
