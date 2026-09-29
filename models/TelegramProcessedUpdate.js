const mongoose = require('mongoose');

/**
 * جلوگیری از پردازش دوباره‌ی یک update (retry ی webhook تلگرام).
 * unique روی updateId؛ TTL: 24 ساعت.
 */
const schema = new mongoose.Schema({
    updateId:  { type: Number, required: true, unique: true },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
});

module.exports =
    mongoose.models.TelegramProcessedUpdate ||
    mongoose.model('TelegramProcessedUpdate', schema);
