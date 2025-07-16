const express = require('express');
const { dispatchBot } = require('./bots/botManager');

const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send('Bot Dispatcher is online.'));

app.post('/dispatch', (req, res) => {
  const { ip, port = 25565, version = false, bots } = req.body;
  if (!ip || !Array.isArray(bots)) {
    return res.status(400).send('Missing required fields: ip, bots[]');
  }

  const results = bots.map(botData => {
    if (!botData.username) return { error: 'Missing username' };
    return dispatchBot(ip, port, version, botData);
  });

  res.json(results);
});

const PORT = 8000;
app.listen(PORT, () => {
  console.log(`[SERVER] Running on port ${PORT}`);
});
