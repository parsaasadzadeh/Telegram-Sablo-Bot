const mongoose = require('mongoose');

/**
 * اتصال دائمی یک کاربر اپ سابلو به یک چت تلگرام.
 * هیچ TTL ای ندارد — تا وقتی کاربر خودش /stop بزند (یا بات را بلاک کند) باقی می‌ماند.
 *
 * userId  : همان _id کاربر در دیتابیس سابلو
 * chatId  : شناسه‌ی چت تلگرام (به‌صورت string)
 * token   : JWT دریافت‌شده از بک‌اند سابلو (برای call های آینده)
 */
const schema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        chatId: { type: String, required: true, unique: true },
        token:  { type: String, required: true },
    },
    { timestamps: true }
);

module.exports =
    mongoose.models.TelegramLink || mongoose.model('TelegramLink', schema);
