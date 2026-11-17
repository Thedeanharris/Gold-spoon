import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { gen } from "@studio/sitegen";

// Real I/O for @studio/publisher: R2 for the page, Workers KV for the hostname map.
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
});

export const render = (draft: object) => gen(draft);

export async function putObject(Key: string, Body: string, ContentType: string) {
  await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET!, Key, Body, ContentType }));
}

export async function putKV(key: string, value: object) {
  const base = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${process.env.KV_NAMESPACE_ID}`;
  const res = await fetch(`${base}/values/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "content-type": "text/plain" },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`KV write failed: ${res.status}`);
}
