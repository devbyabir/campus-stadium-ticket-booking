import 'dotenv/config';
import { pool } from './config/db.js';
import { app } from './app.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

try {
  await pool.query('SELECT 1');
  const server = app.listen(port, () => console.log(`API listening on port ${port}`));
  async function shutdown() {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error('Database startup failed', error);
  await pool.end();
  process.exitCode = 1;
}
