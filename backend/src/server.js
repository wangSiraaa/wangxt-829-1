const express = require('express');
const cors = require('cors');
const { initDB } = require('./db');
const routes = require('./routes');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use('/api', routes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '社区托育补助发放系统 API 正常运行' });
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`后端服务运行在 http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});
