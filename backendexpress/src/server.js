require('dotenv').config(); // Load environment variables as early as possible

const app = require('./app');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Startup diagnostics: show which Supabase key var is present (without values)
(() => {
  const urlPresent = Boolean(process.env.SUPABASE_URL);
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasAliasKey = Boolean(process.env.SUPABASE_KEY);
  // eslint-disable-next-line no-console
  console.log(`[startup] Supabase env -> URL: ${urlPresent}, SERVICE_ROLE_KEY: ${hasServiceKey}, KEY(alias): ${hasAliasKey}`);
})();

const server = app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

module.exports = server;
