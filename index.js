const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    message: 'Tropipay TestQA app is running',
    env: process.env.NODE_ENV || 'development',
    branch: process.env.BRANCH || 'unknown',
    commit: process.env.COMMIT_SHA || 'unknown',
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/login', (req, res) => {
  res.json({ status: 'ok', page: 'login' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TestQA app listening on port ${PORT}`);
});
