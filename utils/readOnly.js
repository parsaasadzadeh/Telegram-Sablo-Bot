/**
 * پلاگین «فقط‌خواندنی» برای مدل‌هایی که متعلق به دیتابیس اصلی سابلو هستند.
 * هر تلاشی برای نوشتن/حذف روی این مدل‌ها قبل از رسیدن به دیتابیس با خطا رد می‌شود،
 * تا ربات هرگز نتواند داده‌ی اپ را تغییر بدهد.
 *
 * علاوه بر این: autoIndex و autoCreate خاموش‌اند (ربات ایندکس/کالکشن جدیدی در دیتابیس اصلی نمی‌سازد).
 */
const WRITE_QUERY_OPS = [
    'updateOne', 'updateMany', 'replaceOne',
    'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete', 'findOneAndRemove',
    'deleteOne', 'deleteMany',
];

function block(name) {
    return function () {
        throw new Error(`⛔ مدل «${name}» فقط‌خواندنی است؛ ربات اجازه‌ی نوشتن روی دیتابیس اصلی را ندارد.`);
    };
}

module.exports = function readOnly(schema, modelName = 'model') {
    WRITE_QUERY_OPS.forEach((op) => schema.pre(op, block(modelName)));
    ['save', 'insertMany', 'bulkWrite'].forEach((op) => schema.pre(op, block(modelName)));
    schema.pre('deleteOne', { document: true, query: false }, block(modelName));
};
