const mongoose = require('mongoose');
const readOnly = require('../utils/readOnly');

/** فقط برای «خوندن» چک‌ها از دیتابیس سابلو (collection: cheques) */
const schema = new mongoose.Schema(
    {
        userId:       { type: mongoose.Schema.Types.ObjectId },
        direction:    String,   // PAYABLE (پرداختی) | RECEIVABLE (دریافتی)
        amount:       Number,   // ریال
        bank:         String,
        chequeNumber: String,
        status:       String,   // PENDING | CLEARED | BOUNCED | CANCELLED
        dueDate:      Date,
        counterparty: String,
    },
    { strict: false, autoIndex: false, autoCreate: false }
);

schema.plugin(readOnly, 'Cheque');

module.exports = mongoose.models.Cheque || mongoose.model('Cheque', schema);
