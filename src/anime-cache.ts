import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

// 1. In-memory fallback (Tier 1)
const memoryStore = new Map<string, { data: unknown; expiry: number }>();

// 2. R2 Configuration
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;

const isR2Enabled = !!(accountId && accessKeyId && secretAccessKey && bucketName);

const s3Client = isR2Enabled ? new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
}) : null;

// Helper to read from stream
async function streamToString(stream: any): Promise<string> {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export async function getCache<T>(key: string, ttlMs?: number): Promise<T | null> {
  // Check Memory first
  const entry = memoryStore.get(key);
  if (entry) {
    if (Date.now() > entry.expiry) {
      memoryStore.delete(key);
    } else {
      return entry.data as T;
    }
  }

  // Check R2 if enabled
  if (isR2Enabled && s3Client) {
    try {
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: `anime-cache/${key}.json`,
      }));
      
      if (response.Body) {
        // If ttlMs is provided, verify the R2 object is not older than ttlMs
        if (ttlMs && response.LastModified) {
          const ageMs = Date.now() - response.LastModified.getTime();
          if (ageMs > ttlMs) {
            console.log(`[R2 Cache] Key ${key} expired (age: ${ageMs}ms > ttl: ${ttlMs}ms)`);
            return null; // Force fetch new data, setCache will overwrite it
          }
        }

        const bodyContents = await streamToString(response.Body);
        const parsed = JSON.parse(bodyContents);
        
        // Populate memory cache to avoid hitting R2 on next request
        // Since R2 acts as permanent/long-term storage, we set a quick local expiry (e.g. 1 hour)
        // If ttlMs is provided, ensure local memory cache doesn't outlive the R2 TTL
        const localExpiry = ttlMs ? Math.min(60 * 60 * 1000, ttlMs) : 60 * 60 * 1000;
        memoryStore.set(key, { data: parsed, expiry: Date.now() + localExpiry });
        
        return parsed as T;
      }
    } catch (err: any) {
      if (err.name !== 'NoSuchKey' && err.$metadata?.httpStatusCode !== 404) {
        console.error(`[R2 Cache] Get Error for key ${key}:`, err.message);
      }
    }
  }

  return null;
}

export async function setCache<T>(key: string, data: T, ttlMs: number): Promise<void> {
  // Set memory cache
  memoryStore.set(key, { data, expiry: Date.now() + ttlMs });

  // Fire and forget R2 cache upload to avoid blocking the API response
  if (isR2Enabled && s3Client) {
    s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: `anime-cache/${key}.json`,
      Body: JSON.stringify(data),
      ContentType: 'application/json',
    })).catch(err => {
      console.error(`[R2 Cache] Set Error for key ${key}:`, err.message);
    });
  }
}
