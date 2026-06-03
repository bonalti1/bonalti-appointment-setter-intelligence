import {
  analyzeSavedTranscripts,
  backfillCallDirections,
  buildDashboardData,
  recordSyncRun,
  syncSheetMetricsToSupabase,
  syncTranscriptsToSupabase
} from "../server.mjs";

const sourceKeys = (process.env.HOURLY_SYNC_SOURCES || "south-texas-builders,cuates")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const transcriptLimit = Number(process.env.HOURLY_TRANSCRIPT_LIMIT || 40);
const analyzeLimit = Number(process.env.HOURLY_ANALYZE_LIMIT || 6);
const skipAi = /^true$/i.test(process.env.HOURLY_SKIP_AI || "");

const startedAt = new Date().toISOString();
const result = {
  ok: true,
  startedAt,
  finishedAt: "",
  sheets: {
    ok: false,
    recordsProcessed: 0,
    message: "Sheet sync did not run."
  },
  transcripts: [],
  ai: [],
  errors: []
};

let dashboard = null;

try {
  dashboard = await buildDashboardData();
  result.sheets = await syncSheetMetricsToSupabase(dashboard.dailyRows);
  await recordSyncRun({
    syncType: "hourly-sheet-metrics",
    status: "success",
    startedAt,
    recordsProcessed: dashboard.dailyRows.length
  });
} catch (error) {
  result.ok = false;
  result.sheets = {
    ok: false,
    recordsProcessed: 0,
    message: error.message
  };
  result.errors.push({
    stage: "sheets",
    message: error.message
  });

  try {
    await recordSyncRun({
      syncType: "hourly-sheet-metrics",
      status: "failed",
      startedAt,
      recordsProcessed: 0,
      errorMessage: error.message
    });
  } catch {
    // Ignore sync-run logging failures so later sync stages can still proceed.
  }
}

for (const sourceKey of sourceKeys) {
  try {
    const transcriptSync = await syncTranscriptsToSupabase(sourceKey, transcriptLimit);
    result.transcripts.push({
      sourceKey,
      ok: transcriptSync.ok !== false,
      recordsProcessed: transcriptSync.recordsProcessed || 0,
      message: transcriptSync.message || ""
    });
  } catch (error) {
    result.ok = false;
    result.transcripts.push({
      sourceKey,
      ok: false,
      recordsProcessed: 0,
      message: error.message
    });
    result.errors.push({
      stage: `transcripts:${sourceKey}`,
      message: error.message
    });
  }

  try {
    const directionSync = await backfillCallDirections(sourceKey, Math.min(transcriptLimit, 40));
    result.transcripts.push({
      sourceKey,
      kind: "call-directions",
      ok: directionSync.ok !== false,
      recordsProcessed: directionSync.recordsProcessed || 0,
      message: directionSync.message || ""
    });
  } catch (error) {
    result.ok = false;
    result.transcripts.push({
      sourceKey,
      kind: "call-directions",
      ok: false,
      recordsProcessed: 0,
      message: error.message
    });
    result.errors.push({
      stage: `call-directions:${sourceKey}`,
      message: error.message
    });
  }

  if (!skipAi && process.env.OPENAI_API_KEY) {
    try {
      const analysis = await analyzeSavedTranscripts(sourceKey, { limit: analyzeLimit });
      result.ai.push({
        sourceKey,
        ok: analysis.ok !== false,
        recordsProcessed: analysis.recordsProcessed || 0,
        message: analysis.message || ""
      });
    } catch (error) {
      result.ok = false;
      result.ai.push({
        sourceKey,
        ok: false,
        recordsProcessed: 0,
        message: error.message
      });
      result.errors.push({
        stage: `ai:${sourceKey}`,
        message: error.message
      });
    }
  }
}

result.finishedAt = new Date().toISOString();
if (skipAi || !process.env.OPENAI_API_KEY) {
  result.aiSkipped = true;
}

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
