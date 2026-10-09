import { createApp } from './app';
import { loadConfig } from './config';
import { Docker } from './docker';
import { loadLog } from './log';
import { Monitor } from './monitor';
import { Nas } from './nas';
import { MemoryStore, MongoStore, type Store } from './store';

const PORT = Number(process.env.PORT ?? 3080);

async function main() {
  const config = loadConfig();

  let store: Store;
  if (process.env.MONGODB_URI) {
    store = await MongoStore.connect(process.env.MONGODB_URI, config.checks.retentionDays);
    console.log('[store] MongoDB connected');
  } else {
    store = new MemoryStore();
    console.warn('[store] MONGODB_URI not set: keeping check history in memory (lost on restart)');
  }

  const monitor = new Monitor(config, store);
  const nas = new Nas(config);
  const docker = new Docker(config);
  const log = loadLog();

  const app = createApp({ config, store, monitor, nas, docker, log });
  const server = app.listen(PORT, () => {
    console.log(`[http] listening on :${PORT} (${config.services.length} services, ${log.length} log entries)`);
  });

  void monitor.start();
  nas.start();

  const shutdown = () => {
    monitor.stop();
    nas.stop();
    server.close(() => void store.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
