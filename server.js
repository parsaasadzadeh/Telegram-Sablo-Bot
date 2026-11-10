// اجرای لوکال به‌صورت سرور HTTP: npm start
// (برای تست ساده‌تر بدون webhook از npm run dev استفاده کن)

require('dotenv').config();
const app  = require('./app');
const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`🚀 http://localhost:${port}/api/health`));
