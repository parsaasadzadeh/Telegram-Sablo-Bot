const mongoose = require('mongoose');
const readOnly = require('../utils/readOnly');

/** فقط برای «خوندن» طلب/بدهی‌ها از دیتابیس سابلو (collection: obligations) */
const schema = new mongoose.Schema(
    {
        userId:     { type: mongoose.Schema.Types.ObjectId },
        kind:       String,   // DEBT (من بدهکارم) | CREDIT (من طلبکارم)
        person:     String,
        title:      String,
        amount:     Number,   // ریال — مبلغ کل
        paidAmount: Number,   // ریال — تسویه‌شده تا الان
        dueDate:    Date,     // اختیاری
    },
    { strict: false, autoIndex: false, autoCreate: false }
);

schema.plugin(readOnly, 'Obligation');

module.exports = mongoose.models.Obligation || mongoose.model('Obligation', schema);
