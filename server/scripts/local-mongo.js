import { MongoBinary } from 'mongodb-memory-server-core';
import { MongoClient } from 'mongodb';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Launch a real mongod with a persistent workspace data directory, not a temporary test DB.
const port = 27018;
const setName = 'stockbook-local';
const uri = `mongodb://127.0.0.1:${port}/?directConnection=true`;
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 1000 });
const delay = () => new Promise((resolve) => setTimeout(resolve, 500));
async function hello() {
  return client.db('admin').command({ hello: 1 });
}
let running;
try {
  await client.connect();
  running = await hello();
} catch {
  await client.close();
}
if (running) {
  if (running.setName !== setName)
    throw new Error(`Port ${port} is used by another MongoDB server; it was not modified.`);
  console.log(`Local MongoDB is already running on port ${port}.`);
  await client.close();
} else {
  const dbPath = fileURLToPath(new URL('../../.local/mongodb/', import.meta.url));
  await mkdir(dbPath, { recursive: true });
  const binary = process.env.MONGOD_BINARY || (await MongoBinary.getPath());
  const child = spawn(
    binary,
    [
      '--dbpath',
      dbPath,
      '--port',
      String(port),
      '--bind_ip',
      '127.0.0.1',
      '--replSet',
      setName,
      '--logpath',
      `${dbPath}/mongod.log`,
      '--logappend',
    ],
    { detached: true, windowsHide: true, stdio: 'ignore' },
  );
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await client.connect();
        await hello();
        break;
      } catch (error) {
        if (attempt >= 40)
          throw new Error(`Local MongoDB failed to start. Check ${dbPath}/mongod.log`, {
            cause: error,
          });
        await delay();
      }
    }
    try {
      await client.db('admin').command({
        replSetInitiate: { _id: setName, members: [{ _id: 0, host: `127.0.0.1:${port}` }] },
      });
    } catch (error) {
      if (error.code !== 23) throw error;
    }
    for (let attempt = 0; !(await hello()).isWritablePrimary; attempt++) {
      if (attempt >= 40) throw new Error('Local MongoDB did not become primary. Check its log.');
      await delay();
    }
    console.log(
      `Persistent local MongoDB ready: mongodb://127.0.0.1:${port}/?replicaSet=${setName}`,
    );
    console.log(`Data directory: ${dbPath}`);
  } finally {
    await client.close();
  }
}
