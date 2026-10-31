import { connectDatabase } from './config/database.js';
import { createRepository } from './repositories/inventoryRepository.js';
import { createInventoryService } from './services/inventoryService.js';
import { createApp } from './app.js';
const { client, db } = await connectDatabase();
const repository = createRepository(client, db);
await repository.initialize();
const app = createApp(createInventoryService(repository));
const port = process.env.PORT || 3001;
const server = app.listen(port, '127.0.0.1', () =>
  console.log(`Inventory API ready on http://127.0.0.1:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () =>
    server.close(async () => {
      await client.close();
      process.exit(0);
    }),
  );
}
