const fs = require('fs');
const path = require('path');

function createLogger(key, username) {
  const filePath = path.join(__dirname, '..', 'logs', `bot_${key.replace(/:/g, '_')}_${username}.log`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  return {
    log: msg => fs.appendFileSync(filePath, `[${new Date().toISOString()}] ${msg}\n`)
  };
}

module.exports = { createLogger };
