import { MongoClient, Db } from 'mongodb';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

let client: MongoClient | null = null;
let db: Db | null = null;

let rawUri = process.env.MONGODB_URI || 'mongodb+srv://Vercel-Admin-wms:22Mei1996@wms.pqinl3i.mongodb.net/?appName=wms';
if (rawUri.startsWith('"') && rawUri.endsWith('"')) {
  rawUri = rawUri.slice(1, -1);
} else if (rawUri.startsWith("'") && rawUri.endsWith("'")) {
  rawUri = rawUri.slice(1, -1);
}
const MONGODB_URI = rawUri.trim();

let rawDb = process.env.MONGODB_DB_NAME || 'wms';
if (rawDb.startsWith('"') && rawDb.endsWith('"')) {
  rawDb = rawDb.slice(1, -1);
} else if (rawDb.startsWith("'") && rawDb.endsWith("'")) {
  rawDb = rawDb.slice(1, -1);
}
const DB_NAME = rawDb.trim();

const LOCAL_DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'data_db')
  : path.join(process.cwd(), 'data_db');

// Ensure local fallback directory exists
try {
  if (!fs.existsSync(LOCAL_DATA_DIR)) {
    fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('Gagal membuat direktori lokal (bisa diabaikan jika berjalan di Vercel):', err);
}

function getLocalFile(collectionName: string): string {
  return path.join(LOCAL_DATA_DIR, `${collectionName}.json`);
}

async function readLocalCollection(collectionName: string): Promise<any[]> {
  const filePath = getLocalFile(collectionName);
  if (!fs.existsSync(filePath)) {
    // Seed initial collections to prevent empty states for static data
    if (collectionName === 'companies') {
      return [
        { id: 'COMPANY_C3_CORP', name: 'Gudang Utama C3 Corp', status: 'ACTIVE', createdAt: new Date().toISOString() }
      ];
    }
    if (collectionName === 'subscriptions') {
      return [
        { id: 'SUB_COMPANY_C3_CORP', companyId: 'COMPANY_C3_CORP', plan: 'ENTERPRISE', status: 'ACTIVE', createdAt: new Date().toISOString() }
      ];
    }
    return [];
  }
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Gagal membaca collection ${collectionName} dari file local:`, err);
    return [];
  }
}

async function writeLocalCollection(collectionName: string, data: any[]): Promise<void> {
  const filePath = getLocalFile(collectionName);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Gagal menulis collection ${collectionName} ke file local:`, err);
  }
}

let lastConnectionError: string | null = null;
let clientPromise: Promise<MongoClient> | null = null;

async function getDbConnection() {
  if (db) return db;
  if (!MONGODB_URI) {
    lastConnectionError = 'MONGODB_URI is not configured in the environment variables';
    return null;
  }
  try {
    if (!clientPromise) {
      client = new MongoClient(MONGODB_URI, {
        connectTimeoutMS: 5000,
        socketTimeoutMS: 5000,
        serverSelectionTimeoutMS: 5000
      });
      clientPromise = client.connect().then(c => {
        console.log('Successfully connected to MongoDB!');
        lastConnectionError = null;
        return c;
      }).catch(err => {
        clientPromise = null;
        client = null;
        throw err;
      });
    }
    const connectedClient = await clientPromise;
    db = connectedClient.db(DB_NAME);
    return db;
  } catch (err: any) {
    lastConnectionError = err.message || String(err);
    console.warn('Could not connect to MongoDB, falling back to local JSON files:', lastConnectionError);
    return null;
  }
}

export const dbHelper = {
  getDiagnostics: async () => {
    const isConnected = !!(await getDbConnection());
    let maskedUri = MONGODB_URI;
    try {
      if (MONGODB_URI) {
        const parsed = new URL(MONGODB_URI);
        if (parsed.password) {
          parsed.password = '******';
        }
        maskedUri = parsed.toString();
      }
    } catch (e) {
      maskedUri = MONGODB_URI ? MONGODB_URI.replace(/:([^:@]+)@/, ':******@') : '';
    }
    return {
      connected: isConnected,
      databaseName: DB_NAME,
      uri: maskedUri,
      error: lastConnectionError,
      environment: process.env.NODE_ENV || 'production',
      isVercel: !!process.env.VERCEL
    };
  },
  find: async (collectionName: string, queryObj: any = {}, sortObj: any = null, limitVal: number = 0, skipVal: number = 0) => {
    const database = await getDbConnection();
    if (database) {
      try {
        let cursor = database.collection(collectionName).find(queryObj);
        if (sortObj) cursor = cursor.sort(sortObj);
        if (skipVal) cursor = cursor.skip(skipVal);
        if (limitVal) cursor = cursor.limit(limitVal);
        const results = await cursor.toArray();
        return results.map(doc => {
          const { _id, ...cleanDoc } = doc;
          return cleanDoc; // return fields without BSON ObjectId for react client safety
        });
      } catch (err) {
        console.error(`MongoDB find error for ${collectionName}:`, err);
      }
    }
    
    // Local JSON fallback
    let data = await readLocalCollection(collectionName);
    
    // Simple query filtering
    if (queryObj && Object.keys(queryObj).length > 0) {
      data = data.filter(item => {
        for (const key in queryObj) {
          const queryVal = queryObj[key];
          if (queryVal && typeof queryVal === 'object') {
            const itemVal = item[key];
            if ('$gte' in queryVal && itemVal < queryVal['$gte']) return false;
            if ('$lte' in queryVal && itemVal > queryVal['$lte']) return false;
            if ('$in' in queryVal) {
              const inArr = queryVal['$in'];
              if (Array.isArray(inArr) && !inArr.includes(itemVal)) return false;
            }
          } else if (item[key] !== queryVal) {
            return false;
          }
        }
        return true;
      });
    }
    
    // Simple sorting
    if (sortObj) {
      const keys = Object.keys(sortObj);
      if (keys.length > 0) {
        const key = keys[0];
        const direction = sortObj[key]; // 1 or -1 or 'desc' / 'asc'
        data.sort((a, b) => {
          const valA = a[key];
          const valB = b[key];
          if (valA === undefined) return 1;
          if (valB === undefined) return -1;
          if (valA < valB) return direction === -1 || direction === 'desc' ? 1 : -1;
          if (valA > valB) return direction === -1 || direction === 'desc' ? -1 : 1;
          return 0;
        });
      }
    }
    
    // Skip & Limit
    if (skipVal > 0) {
      data = data.slice(skipVal);
    }
    if (limitVal > 0) {
      data = data.slice(0, limitVal);
    }
    return data;
  },

  findOne: async (collectionName: string, queryObj: any) => {
    const database = await getDbConnection();
    if (database) {
      try {
        const doc = await database.collection(collectionName).findOne(queryObj);
        if (doc) {
          const { _id, ...cleanDoc } = doc;
          return cleanDoc;
        }
        return null;
      } catch (err) {
        console.error(`MongoDB findOne error for ${collectionName}:`, err);
      }
    }
    const data = await readLocalCollection(collectionName);
    return data.find(item => {
      for (const key in queryObj) {
        if (item[key] !== queryObj[key]) return false;
      }
      return true;
    }) || null;
  },

  upsert: async (collectionName: string, queryObj: any, docObj: any) => {
    const database = await getDbConnection();
    if (database) {
      try {
        const { _id, ...cleanDoc } = docObj;
        await database.collection(collectionName).updateOne(queryObj, { $set: cleanDoc }, { upsert: true });
        return docObj;
      } catch (err) {
        console.error(`MongoDB upsert error for ${collectionName}:`, err);
      }
    }
    
    // Local JSON fallback
    const data = await readLocalCollection(collectionName);
    const idx = data.findIndex(item => {
      for (const key in queryObj) {
        if (item[key] !== queryObj[key]) return false;
      }
      return true;
    });
    
    if (idx >= 0) {
      data[idx] = { ...data[idx], ...docObj };
    } else {
      data.push(docObj);
    }
    await writeLocalCollection(collectionName, data);
    return docObj;
  },

  updateMany: async (collectionName: string, queryObj: any, updateFields: any) => {
    const database = await getDbConnection();
    if (database) {
      try {
        await database.collection(collectionName).updateMany(queryObj, { $set: updateFields });
        return;
      } catch (err) {
        console.error(`MongoDB updateMany error for ${collectionName}:`, err);
      }
    }
    
    // Local JSON fallback
    const data = await readLocalCollection(collectionName);
    let updatedCount = 0;
    const updated = data.map(item => {
      let match = true;
      for (const key in queryObj) {
        if (item[key] !== queryObj[key]) {
          match = false;
          break;
        }
      }
      if (match) {
        updatedCount++;
        return { ...item, ...updateFields };
      }
      return item;
    });
    if (updatedCount > 0) {
      await writeLocalCollection(collectionName, updated);
    }
  },

  insertMany: async (collectionName: string, docsList: any[]) => {
    if (!docsList || docsList.length === 0) return;
    const database = await getDbConnection();
    if (database) {
      try {
        const cleanDocs = docsList.map(({ _id, ...d }) => d);
        await database.collection(collectionName).insertMany(cleanDocs);
        return;
      } catch (err) {
        console.error(`MongoDB insertMany error for ${collectionName}:`, err);
      }
    }
    
    // Local JSON fallback
    const data = await readLocalCollection(collectionName);
    for (const newDoc of docsList) {
      const idKey = newDoc.id ? 'id' : newDoc.sku ? 'sku' : '';
      let idx = -1;
      if (idKey) {
        idx = data.findIndex(item => item[idKey] === newDoc[idKey]);
      }
      if (idx >= 0) {
        data[idx] = { ...data[idx], ...newDoc };
      } else {
        data.push(newDoc);
      }
    }
    await writeLocalCollection(collectionName, data);
  },

  deleteOne: async (collectionName: string, queryObj: any) => {
    const database = await getDbConnection();
    if (database) {
      try {
        await database.collection(collectionName).deleteOne(queryObj);
        return;
      } catch (err) {
        console.error(`MongoDB deleteOne error for ${collectionName}:`, err);
      }
    }
    
    // Local JSON fallback
    const data = await readLocalCollection(collectionName);
    const idx = data.findIndex(item => {
      for (const key in queryObj) {
        if (item[key] !== queryObj[key]) return false;
      }
      return true;
    });
    if (idx >= 0) {
      data.splice(idx, 1);
      await writeLocalCollection(collectionName, data);
    }
  },

  deleteMany: async (collectionName: string, queryObj: any) => {
    const database = await getDbConnection();
    if (database) {
      try {
        await database.collection(collectionName).deleteMany(queryObj);
        return;
      } catch (err) {
        console.error(`MongoDB deleteMany error for ${collectionName}:`, err);
      }
    }
    
    // Local JSON fallback
    const data = await readLocalCollection(collectionName);
    const filtered = data.filter(item => {
      for (const key in queryObj) {
        if (queryObj[key] && Array.isArray(queryObj[key]['$in'])) {
          if (!queryObj[key]['$in'].includes(item[key])) return false;
        } else if (item[key] !== queryObj[key]) {
          return false;
        }
      }
      return true;
    });
    const remaining = data.filter(item => !filtered.includes(item));
    await writeLocalCollection(collectionName, remaining);
  }
};
