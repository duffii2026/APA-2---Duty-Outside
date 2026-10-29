// APA 2 backend process.
module.exports = {
  apps: [
    {
      name: 'apa2-duty-backend',
      script: 'dist/serverduty.bundle.js',
      node_args: '--env-file=.env',
      watch: ['dist'],
      ignore_watch: ['node_modules'],
      watch_delay: 1000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
