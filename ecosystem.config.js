/**
 * PM2 Configuration for Nong-Kati
 * Use with: pm2 start ecosystem.config.js
 */

module.exports = {
  apps: [
    {
      name: 'nong-kati',
      script: 'server.js',
      instances: 'max', // Use all available CPUs
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Restart on crash
      max_restarts: 10,
      restart_delay: 5000,
      // Memory limit
      max_memory_restart: '1G',
      // Logging
      error_file: 'logs/error.log',
      out_file: 'logs/output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Auto restart
      autorestart: true,
      watch: false,
      // Environment variables
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
