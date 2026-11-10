const mongoose = require('mongoose');
const readOnly = require('../utils/readOnly');

/**
 * فقط برای «خوندن» اعلان‌های اپ (collection: notifications).
 * هشدار بودجه را خود بک‌اند هنگام ثبت هر هزینه می‌سازد (budgetLevel = 80 | 100)؛
 * ربات همان را به تلگرام فوروارد می‌کند تا منطق بودجه دو جا تکرار نشود.
 */
const schema = new mongoose.Schema(
    {
        userId:    { type: mongoose.Schema.Types.ObjectId },
        title:     String,
        message:   String,
        budgetLevel: Number,
        createdAt: Date,
    },
    { strict: false, autoIndex: false, autoCreate: false }
);

schema.plugin(readOnly, 'Notification');

module.exports = mongoose.models.Notification || mongoose.model('Notification', schema);
