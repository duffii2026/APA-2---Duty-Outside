// APA 2 frontend static server.
module.exports = {
  apps: [
    {
      name: 'apa2-duty-outside',
      script: 'server.cjs',
      node_args: '--env-file=.env.production',
      watch: ['dist2'],
      ignore_watch: ['node_modules'],
      watch_delay: 1000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
