import { syncTranscriptsToSupabase } from "../server.mjs";

const sourceKeys = (process.env.TRANSCRIPT_SYNC_SOURCES || "south-texas-builders,cuates")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const limit = Number(process.env.TRANSCRIPT_SYNC_LIMIT || 200);

const results = [];

for (const sourceKey of sourceKeys) {
  const payload = await syncTranscriptsToSupabase(sourceKey, limit);
  if (payload.ok === false) {
    throw new Error(`${sourceKey}: ${payload.message || "Sync failed."}`);
  }

  results.push({
    sourceKey,
    recordsProcessed: payload.recordsProcessed || 0,
    message: payload.message || ""
  });
}

console.log(JSON.stringify({ ok: true, results }, null, 2));
