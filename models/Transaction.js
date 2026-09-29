const mongoose = require('mongoose');

/**
 * فقط برای «خوندن» اقساط از دیتابیس سابلو. (collection: transactions)
 */
const schema = new mongoose.Schema(
    {
        userId:  { type: mongoose.Schema.Types.ObjectId, index: true },
        type:    String,
        title:   String,
        amount:  Number,
        isPaid:  Boolean,
        dueDate: Date,
        date:    Date,
    },
    { strict: false }
);

module.exports =
    mongoose.models.Transaction || mongoose.model('Transaction', schema);
