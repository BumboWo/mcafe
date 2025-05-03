app.get('/dispatch', async (req, res) => {
  const ip = req.query.ip;
  const port = parseInt(req.query.port) || 25565;
  const user1 = req.query.user1;
  const user2 = req.query.user2;
  const key = `${ip}:${port}`;

  if (!ip) return res.status(400).send('Missing ?ip= parameter.');
  if (activeBots[key]) return res.send(`Bots already running on ${key}`);

  console.log(`[DISPATCH] Spawning bots to ${key}`);
  activeBots[key] = [];

  spawnBot(ip, port, 0, key, user1);
  spawnBot(ip, port, 1, key, user2);

  res.send(`Dispatched 2 bots to ${key}${user1 || user2 ? ' with custom usernames.' : ''}`);
});

function spawnBot(ip, port, botIndex, key, overrideUsername) {
  const botConfig = config["bot-accounts"][botIndex];

  if (!botConfig && !overrideUsername) {
    console.warn(`[WARN] No bot config or override for index ${botIndex}. Skipping.`);
    return;
  }

  const username = overrideUsername || botConfig.username;

  const bot = mineflayer.createBot({
    username,
    password: overrideUsername ? undefined : botConfig.password,
    auth: overrideUsername ? 'offline' : botConfig.type,
    host: ip,
    port,
    version: config.server.version || false,
  });

  activeBots[key].push(bot);

  bot.loadPlugin(pathfinder);
  const mcData = mcDataLoader(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.settings.colorsEnabled = false;

  bot.once('spawn', () => {
    console.log(`\x1b[33m[Bot ${botIndex + 1}] (${username}) joined ${key}\x1b[0m`);

    if (config.utils['auto-auth'].enabled) {
      setTimeout(() => {
        const pwd = config.utils['auto-auth'].password;
        bot.chat(`/register ${pwd} ${pwd}`);
        bot.chat(`/login ${pwd}`);
      }, 500);
    }

    if (config.utils['chat-messages'].enabled) {
      const messages = config.utils['chat-messages'].messages;
      const delay = config.utils['chat-messages']['repeat-delay'] * 1000;
      if (config.utils['chat-messages'].repeat) {
        let i = 0;
        setInterval(() => {
          bot.chat(messages[i]);
          i = (i + 1) % messages.length;
        }, delay);
      } else {
        messages.forEach(msg => bot.chat(msg));
      }
    }

    if (config.position.enabled) {
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(config.position.x, config.position.y, config.position.z));
    }

    if (config.utils['anti-afk'].enabled) {
      bot.setControlState('jump', true);
      if (config.utils['anti-afk'].sneak) bot.setControlState('sneak', true);
    }
  });

  bot.on('goal_reached', () => {
    console.log(`\x1b[32m[Bot ${botIndex + 1}] Reached destination on ${key}.\x1b[0m`);
  });

  bot.on('death', () => {
    console.log(`\x1b[33m[Bot ${botIndex + 1}] Died on ${key}.\x1b[0m`);
  });

  bot.on('end', () => {
    console.log(`\x1b[31m[Bot ${botIndex + 1}] (${username}) Disconnected from ${key}. Reconnecting...\x1b[0m`);
    setTimeout(() => spawnBot(ip, port, botIndex, key, overrideUsername), config.utils['auto-reconnect-delay']);
  });

  bot.on('kicked', reason => {
    console.warn(`\x1b[33m[Bot ${botIndex + 1}] (${username}) Kicked: ${reason}\x1b[0m`);
  });

  bot.on('error', err => {
    console.error(`\x1b[31m[ERROR] [Bot ${botIndex + 1}] (${username}) ${err.message}\x1b[0m`);
  });
}
