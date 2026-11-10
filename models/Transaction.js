const mongoose = require('mongoose');
const readOnly = require('../utils/readOnly');

/**
 * فقط برای «خوندن» اقساط از دیتابیس سابلو. (collection: transactions)
 */
const schema = new mongoose.Schema(
    {
        userId:  { type: mongoose.Schema.Types.ObjectId },
        type:    String,
        title:   String,
        amount:  Number,
        isPaid:  Boolean,
        dueDate: Date,
        date:    Date,
    },
    { strict: false, autoIndex: false, autoCreate: false }
);

schema.plugin(readOnly, 'Transaction');

module.exports =
    mongoose.models.Transaction || mongoose.model('Transaction', schema);
