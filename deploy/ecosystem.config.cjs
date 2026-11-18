// pm2 en el servidor propio (ADR-0059). Las variables salen de .env.production.local, que Next carga solo.
//   pm2 start deploy/ecosystem.config.cjs && pm2 save     # la primera vez (deploy/setup.sh)
//   pm2 restart cheapllm-web --update-env                 # cada deploy
const root = `${__dirname}/..`;

module.exports = {
  apps: [
    {
      name: "cheapllm-web",
      cwd: root,
      script: `${root}/node_modules/next/dist/bin/next`,
      // nginx manda cheapllm.wtf y api.cheapllm.wtf a este puerto. Los anteriores son de las otras apps del servidor.
      args: ["start", "--port", "3014", "--hostname", "127.0.0.1"],
      env: { NODE_ENV: "production" },
    },
  ],
};
