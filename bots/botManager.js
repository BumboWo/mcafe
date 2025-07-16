const mineflayer = require('mineflayer');
const { createLogger } = require('../utils/logger');

const activeBots = {};

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function botKey(ip, port, username) {
  return `${ip}:${port}:${username}`;
}

function dispatchBot(ip, port, version, botData) {
  const username = botData.username;
  const key = botKey(ip, port, username);

  if (activeBots[key]) return { error: `Bot already active: ${username} on ${ip}:${port}` };

  const logger = createLogger(`${ip}:${port}`, username);
  const session = {
    key,
    ip,
    port,
    version,
    botData,
    logger,
    meta: { reconnecting: false }
  };

  activeBots[key] = session;
  spawnBot(session);
  return { success: `Bot dispatched: ${username}` };
}

function spawnBot(session) {
  const { ip, port, version, botData, logger, key } = session;
  const username = botData.username;

  logger.log(`Spawning bot ${username} on ${ip}:${port}`);
  const bot = mineflayer.createBot({
    username,
    auth: botData.auth || 'offline',
    host: ip,
    port,
    version
  });

  session.bot = bot;

  bot.once('spawn', () => {
    logger.log(`[SPAWNED] ${username}`);

    if (Array.isArray(botData.commands)) {
      const loop = botData.loop ?? true;
      const run = async () => {
        for (const cmd of botData.commands) {
          if (cmd.delay) await wait(cmd.delay * 1000);
          if (cmd.text) bot.chat(cmd.text);
        }
        if (loop) run();
      };
      run();
    }

    if (botData.antiAfk?.enabled) {
      if (botData.antiAfk.jump) bot.setControlState('jump', true);
      if (botData.antiAfk.sneak) bot.setControlState('sneak', true);
    }

    if (botData.heartbeat?.command) {
      const interval = (botData.heartbeat.intervalSeconds || 60) * 1000;
      const hb = () => {
        bot.chat(botData.heartbeat.command);
        logger.log(`[Heartbeat] ${botData.heartbeat.command}`);
      };
      hb();
      const heartbeat = setInterval(hb, interval);
      bot.once('end', () => clearInterval(heartbeat));
    }
  });

  bot.on('end', () => {
    logger.log(`[DISCONNECTED] ${username}`);
    scheduleReconnect(session);
  });

  bot.on('death', () => logger.log(`[DEATH] ${username}`));
  bot.on('error', err => logger.log(`[ERROR] ${err.message}`));

  bot.on('kicked', reason => {
    const reasonStr = typeof reason === 'string' ? reason : JSON.stringify(reason);
    logger.log(`[KICKED] ${reasonStr}`);

    if (reasonStr.toLowerCase().includes("hammered")) {
      destroyBot(key);
    } else {
      scheduleReconnect(session);
    }
  });
}

function scheduleReconnect(session) {
  if (session.meta.reconnecting) return;
  session.meta.reconnecting = true;

  session.logger.log(`[RECONNECT] Waiting 5s before respawn...`);
  setTimeout(() => {
    session.meta.reconnecting = false;
    spawnBot(session);
  }, 5000);
}

function destroyBot(key) {
  const session = activeBots[key];
  if (!session) return;
  session.logger.log(`[DESTROY] Cleaning up ${session.botData.username}`);
  session.bot?.removeAllListeners();
  delete activeBots[key];
}

module.exports = { dispatchBot, destroyBot };
