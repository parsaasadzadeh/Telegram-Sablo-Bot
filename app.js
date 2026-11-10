const express        = require('express');
const telegramRoutes = require('./routes/telegramRoutes');

const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'sablo-telegram-bot' }));

app.use('/api', telegramRoutes);

module.exports = app;
