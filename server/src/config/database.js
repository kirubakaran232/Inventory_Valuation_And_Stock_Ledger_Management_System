import { MongoClient } from 'mongodb';

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    console.log(`Connected to MongoDB at ${uri}`);
    return { client, db: client.db(process.env.MONGODB_DATABASE || 'stockbook') };
  } catch (error) {
    await client.close();
    throw new Error(`Database connection failed: ${error.message}`, { cause: error });
  }
}
