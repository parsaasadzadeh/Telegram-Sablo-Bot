const mongoose = require('mongoose');
const readOnly = require('../utils/readOnly');

/** فقط برای «خوندن» ارز نمایشی کاربر (collection: users) */
const schema = new mongoose.Schema(
    { currency: String }, // IRT | IRR
    { strict: false, autoIndex: false, autoCreate: false }
);

schema.plugin(readOnly, 'User');

module.exports = mongoose.models.User || mongoose.model('User', schema);
