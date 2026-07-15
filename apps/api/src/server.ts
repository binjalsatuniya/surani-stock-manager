import { app } from './app';
import { env } from './config/env';

function start(retriesLeft = 20) {
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://0.0.0.0:${env.PORT}`);
  });

  // tsx watch sometimes restarts this process before the previous instance has fully released
  // the port; retry for a few seconds instead of crashing the whole dev server on a transient EADDRINUSE.
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && retriesLeft > 0) {
      setTimeout(() => start(retriesLeft - 1), 400);
    } else {
      throw err;
    }
  });
}

start();
