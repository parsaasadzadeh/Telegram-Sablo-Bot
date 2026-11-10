const mongoose = require('mongoose');

/**
 * جلوگیری از ارسال تکراری یادآوری.
 * unique روی (transactionId, reminderType)؛ TTL: 30 روز.
 */
const schema = new mongoose.Schema({
    transactionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    reminderType:  { type: String, required: true },
    createdAt:     { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
});

schema.index({ transactionId: 1, reminderType: 1 }, { unique: true });

module.exports =
    mongoose.models.TelegramReminderLog ||
    mongoose.model('TelegramReminderLog', schema);
