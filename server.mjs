import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

loadDotEnv();
loadDotEnv(process.env.META_ENV_FILE || path.resolve(__dirname, "../../2026-05-12/i-want-to-make-a-dashboard/.env"));

const config = {
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 4288),
  sheetId: process.env.GOOGLE_SHEET_ID || "1rjmXjtyBTmch7SJY58cA8ZGKYWlwPxEe0WOd2Ce9i2Q",
  sheetTabs: parseSheetTabs(process.env.SHEET_TABS),
  supabaseUrl: trimSlash(process.env.SUPABASE_URL || ""),
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  ghlApiBase: trimSlash(process.env.GHL_API_BASE || "https://services.leadconnectorhq.com"),
  ghlApiVersion: process.env.GHL_API_VERSION || "2021-07-28",
  ghlLocationId: process.env.GHL_LOCATION_ID || "",
  ghlToken: process.env.GHL_API_KEY || process.env.GHL_PRIVATE_INTEGRATION_TOKEN || process.env.GOHIGHLEVEL_API_KEY || "",
  ghlLocations: {
    "south-texas-builders": {
      sourceKey: "south-texas-builders",
      sourceName: "South Texas Builders",
      locationId: process.env.GHL_LOCATION_ID || "",
      token: process.env.GHL_API_KEY || process.env.GHL_PRIVATE_INTEGRATION_TOKEN || process.env.GOHIGHLEVEL_API_KEY || ""
    },
    cuates: {
      sourceKey: "cuates",
      sourceName: "Cuates Construction",
      locationId: process.env.CUATES_GHL_LOCATION_ID || "",
      token: process.env.CUATES_GHL_API_KEY || process.env.CUATES_GHL_PRIVATE_INTEGRATION_TOKEN || ""
    }
  },
  openAiKey: process.env.OPENAI_API_KEY || "",
  openAiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  metaVersion: process.env.META_API_VERSION || "v25.0",
  metaTokens: {
    "south-texas-builders": process.env.SOUTH_TEXAS_META_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || "",
    cuates: process.env.CUATES_META_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || ""
  },
  metaAccounts: {
    "south-texas-builders": process.env.SOUTH_TEXAS_META_AD_ACCOUNT_ID || process.env.META_AD_ACCOUNT_ID || "",
    cuates: process.env.CUATES_META_AD_ACCOUNT_ID || ""
  }
};

const minAiCallSeconds = Number(process.env.MIN_AI_CALL_SECONDS || 20);
const aiReviewVersion = "call-intel-lite-v3";
const centralizedStartDate = process.env.CENTRALIZED_DATA_START_DATE || "2026-06-01";
const metaSpendCacheMs = Number(process.env.META_SPEND_CACHE_MS || 15 * 60 * 1000);
const metaSpendCache = new Map();

const metricSourceBlocks = [
  { key: "south-texas-builders", name: "South Texas Builders", start: 1 },
  { key: "aurora", name: "Aurora", start: 10 },
  { key: "cuates", name: "Cuates", start: 19 },
  { key: "bryanna-hdz-stb", name: "Bryanna Hdz / South Texas Builders", start: 30 }
];

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname === "/api/status") {
      return sendJson(res, await getStatus());
    }

    if (url.pathname === "/api/debug/data-counts") {
      return sendJson(res, await getDataCounts());
    }

    if (url.pathname === "/api/sync/latest") {
      return sendJson(res, await getLatestSyncStatus());
    }

    if (url.pathname === "/api/sync/mark" && req.method === "POST") {
      const body = await readJsonBody(req);
      return sendJson(res, await markSyncRun({
        syncType: cleanText(body.syncType || "manual-latest-leads"),
        recordsProcessed: toNumber(body.recordsProcessed)
      }));
    }

    if (url.pathname === "/api/dashboard") {
      const data = await buildDashboardData();
      return sendJson(res, data);
    }

    if (url.pathname === "/api/sync/sheets" && req.method === "POST") {
      const data = await buildDashboardData();
      const result = await syncSheetMetricsToSupabase(data.dailyRows);
      return sendJson(res, result);
    }

    if (url.pathname === "/api/sync/ghl" && req.method === "POST") {
      return sendJson(res, await syncGhl());
    }

    if (url.pathname === "/api/transcripts") {
      const sourceKey = url.searchParams.get("sourceKey") || "cuates";
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 40)));
      return sendJson(res, await fetchRecentTranscripts(sourceKey, limit));
    }

    if (url.pathname === "/api/transcripts/saved") {
      const sourceKey = url.searchParams.get("sourceKey") || "all";
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 80)));
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      return sendJson(res, await fetchSavedTranscripts(sourceKey, { limit, from, to }));
    }

    if (url.pathname === "/api/sync/transcripts" && req.method === "POST") {
      const sourceKey = url.searchParams.get("sourceKey") || "all";
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 200)));
      return sendJson(res, await syncTranscriptsToSupabase(sourceKey, limit));
    }

    if (url.pathname === "/api/sync/call-directions" && req.method === "POST") {
      const sourceKey = url.searchParams.get("sourceKey") || "all";
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 80)));
      return sendJson(res, await backfillCallDirections(sourceKey, limit));
    }

    if (url.pathname === "/api/ai/reviews" && req.method === "POST") {
      const sourceKey = url.searchParams.get("sourceKey") || "all";
      const limit = Math.min(25, Math.max(1, Number(url.searchParams.get("limit") || 8)));
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      return sendJson(res, await analyzeSavedTranscripts(sourceKey, { limit, from, to }));
    }

    if (url.pathname === "/api/ai/analyze-calls" && req.method === "POST") {
      const sourceKey = url.searchParams.get("sourceKey") || "all";
      const syncLimit = Math.min(60, Math.max(0, Number(url.searchParams.get("syncLimit") || 0)));
      const analyzeLimit = Math.min(12, Math.max(1, Number(url.searchParams.get("analyzeLimit") || 6)));
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      const sync = syncLimit > 0
        ? await syncTranscriptsToSupabase(sourceKey, syncLimit)
        : { ok: true, recordsProcessed: 0, message: "Used already-saved call transcripts." };
      const analysis = await analyzeSavedTranscripts(sourceKey, { limit: analyzeLimit, from, to });
      return sendJson(res, {
        ok: true,
        message: `Call analysis finished. Analyzed ${analysis.recordsProcessed || 0} saved call${analysis.recordsProcessed === 1 ? "" : "s"}.`,
        recordsProcessed: (sync.recordsProcessed || 0) + (analysis.recordsProcessed || 0),
        sync,
        analysis
      });
    }

    if (url.pathname === "/api/client-notes") {
      const sourceKey = url.searchParams.get("sourceKey") || "";
      const clientName = url.searchParams.get("clientName") || "";
      return sendJson(res, await fetchClientNotes(sourceKey, clientName));
    }

    if (url.pathname === "/api/client-activity") {
      const sourceKey = url.searchParams.get("sourceKey") || "";
      const clientName = url.searchParams.get("clientName") || "";
      return sendJson(res, await fetchClientActivity(sourceKey, clientName));
    }

    if (url.pathname === "/api/daily-activity") {
      const sourceKey = url.searchParams.get("sourceKey") || "all";
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      const limit = Math.min(400, Math.max(1, Number(url.searchParams.get("limit") || 150)));
      return sendJson(res, await fetchDailyActivity(sourceKey, { from, to, limit }));
    }

    if (url.pathname === "/api/activity/stats") {
      const sourceKey = url.searchParams.get("sourceKey") || "all";
      const from = url.searchParams.get("from") || dateKey(new Date());
      const to = url.searchParams.get("to") || from;
      const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") || 500)));
      return sendJson(res, await fetchActivityStats(sourceKey, { from, to, limit }));
    }

    if (url.pathname === "/api/transcripts/translate" && req.method === "POST") {
      const body = await readJsonBody(req);
      return sendJson(res, await translateTranscriptToSpanish(body.messageId || ""));
    }

    if (url.pathname === "/api/notes/translate" && req.method === "POST") {
      const body = await readJsonBody(req);
      return sendJson(res, await translateNotesToSpanish(body.notes || {}));
    }

    if (url.pathname === "/api/daily-summary" && req.method === "POST") {
      const body = await readJsonBody(req);
      return sendJson(res, await generateDailyExecutiveSummary(body));
    }

    return serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    return sendJson(res, { error: error.message || "Unexpected error" }, 500);
  }
});

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  server.listen(config.port, config.host, () => {
    console.log(`Appointment Setter Intelligence Dashboard running on http://localhost:${config.port}`);
  });
}

async function getStatus() {
  return {
    sheet: { configured: Boolean(config.sheetId), tabs: config.sheetTabs.length },
    supabase: {
      configured: Boolean(config.supabaseUrl && config.supabaseServiceRoleKey),
      url: config.supabaseUrl ? maskUrl(config.supabaseUrl) : ""
    },
    ghl: {
      configured: Object.values(config.ghlLocations).some((location) => location.token && location.locationId),
      locationId: config.ghlLocationId ? mask(config.ghlLocationId) : "",
      apiBase: config.ghlApiBase,
      locations: Object.fromEntries(Object.entries(config.ghlLocations).map(([key, location]) => [
        key,
        Boolean(location.token && location.locationId)
      ]))
    },
    ai: { configured: Boolean(config.openAiKey), model: config.openAiModel },
    meta: {
      configured: Object.entries(config.metaAccounts).some(([key, account]) => account && config.metaTokens[key]),
      accounts: Object.fromEntries(Object.entries(config.metaAccounts).map(([key, account]) => [
        key,
        Boolean(account && config.metaTokens[key])
      ]))
    }
  };
}

async function getDataCounts() {
  if (!hasSupabase()) {
    return {
      ok: false,
      message: "Supabase is not configured.",
      supabaseConfigured: false,
      centralizedStartDate
    };
  }

  const [companies, dailyEntries, meetings] = await Promise.all([
    supabaseRequest("/rest/v1/companies?select=id,slug,name,active&active=eq.true", { method: "GET" }),
    supabaseRequest(`/rest/v1/daily_entries?select=id,company_id,entry_date,leads&entry_date=gte.${encodeURIComponent(centralizedStartDate)}&order=entry_date.asc`, { method: "GET" }),
    supabaseRequest(`/rest/v1/meetings?select=id,company_id,meeting_date,meeting_type,status&meeting_date=gte.${encodeURIComponent(centralizedStartDate)}&order=meeting_date.asc`, { method: "GET" })
  ]);

  return {
    ok: true,
    supabaseConfigured: true,
    centralizedStartDate,
    companyCount: Array.isArray(companies) ? companies.length : 0,
    dailyEntryCount: Array.isArray(dailyEntries) ? dailyEntries.length : 0,
    meetingCount: Array.isArray(meetings) ? meetings.length : 0,
    leads: (Array.isArray(dailyEntries) ? dailyEntries : []).reduce((sum, row) => sum + toNumber(row.leads), 0),
    lenderMeetings: (Array.isArray(meetings) ? meetings : []).filter((row) => cleanText(row.meeting_type).toLowerCase() === "lender").length,
    constructionMeetings: (Array.isArray(meetings) ? meetings : []).filter((row) => cleanText(row.meeting_type).toLowerCase() === "construction").length
  };
}

async function getLatestSyncStatus() {
  if (!hasSupabase()) {
    return { ok: false, message: "Supabase is not configured yet.", latest: null };
  }

  const rows = await supabaseRequest("/rest/v1/sync_runs?select=sync_type,status,started_at,finished_at,records_processed,error_message&order=finished_at.desc.nullslast,started_at.desc&limit=1", {
    method: "GET"
  });
  const latest = Array.isArray(rows) ? rows[0] : null;
  return {
    ok: true,
    latest
  };
}

async function markSyncRun({ syncType, recordsProcessed = 0 }) {
  const startedAt = new Date().toISOString();
  await recordSyncRun({
    syncType,
    status: "success",
    startedAt,
    recordsProcessed
  });
  return {
    ok: true,
    message: "Sync timestamp updated.",
    recordsProcessed
  };
}

export async function buildDashboardData() {
  const centralized = await fetchCentralizedDashboardData(centralizedStartDate);

  const baseDailyRows = centralized.dailyRows;
  const spend = await attachMetaSpend(baseDailyRows);
  const dailyRows = spend.dailyRows;
  const clients = centralized.clients;
  const totals = sumMetrics(dailyRows);
  const byMonth = groupMetrics(dailyRows, (row) => row.monthName);
  const byWeek = groupMetrics(dailyRows, (row) => weekKey(row.date));
  const bySource = groupMetrics(dailyRows, (row) => row.sourceName);
  const bySetter = groupClientsBySetter(clients);

  return {
    generatedAt: new Date().toISOString(),
    status: await getStatus(),
    totals: addRates(totals),
    byMonth: Object.entries(byMonth).map(([label, metrics]) => ({ label, ...addRates(metrics) })),
    byWeek: Object.entries(byWeek).map(([label, metrics]) => ({ label, ...addRates(metrics) })),
    bySource: Object.entries(bySource).map(([label, metrics]) => ({ label, ...addRates(metrics) })),
    bySetter,
    clients,
    dailyRows,
    dataSources: {
      dashboardSource: "centralizedSupabase",
      googleSheets: "disabled",
      centralizedSupabaseFrom: centralizedStartDate,
      centralizedRecords: centralized.recordsProcessed,
      metaSpend: {
        live: spend.live,
        recordsProcessed: spend.recordsProcessed,
        errors: spend.errors
      }
    }
  };
}

async function fetchCentralizedDashboardData(startDate) {
  if (!hasSupabase()) return { dailyRows: [], clients: [], recordsProcessed: 0 };

  try {
    const [companyRows, dailyEntries, meetings] = await Promise.all([
      supabaseRequest("/rest/v1/companies?select=id,slug,name,active&active=eq.true", { method: "GET" }),
      supabaseRequest(`/rest/v1/daily_entries?select=*&entry_date=gte.${encodeURIComponent(startDate)}&order=entry_date.asc`, { method: "GET" }),
      supabaseRequest(`/rest/v1/meetings?select=*&meeting_date=gte.${encodeURIComponent(startDate)}&order=meeting_date.desc`, { method: "GET" })
    ]);
    const companiesById = new Map((Array.isArray(companyRows) ? companyRows : []).map((company) => [company.id, normalizeCentralCompany(company)]));
    const dailyByKey = new Map();

    for (const entry of Array.isArray(dailyEntries) ? dailyEntries : []) {
      const company = companiesById.get(entry.company_id);
      if (!company) continue;
      const date = entry.entry_date || "";
      if (!date) continue;
      const key = `${company.sourceKey}:${date}`;
      dailyByKey.set(key, {
        sourceKey: company.sourceKey,
        sourceName: company.sourceName,
        date,
        monthName: monthNameFromDate(date),
        leads: toNumber(entry.leads),
        noAnswer: toNumber(entry.no_answer),
        notQualified: toNumber(entry.not_qualified),
        qualified: toNumber(entry.qualified_leads),
        lender: 0,
        meetingsBooked: 0,
        noShows: 0,
        meetingsAttended: 0,
        closedDeals: 0
      });
    }

    const meetingRows = Array.isArray(meetings) ? meetings : [];
    const relatedMeetings = await fetchMeetingRelatedData(meetingRows.map((meeting) => meeting.id).filter(Boolean));
    const clients = [];
    for (const meeting of meetingRows) {
      const company = companiesById.get(meeting.company_id);
      if (!company) continue;
      const date = meeting.meeting_date || "";
      if (!date) continue;
      const key = `${company.sourceKey}:${date}`;
      if (!dailyByKey.has(key)) {
        dailyByKey.set(key, {
          sourceKey: company.sourceKey,
          sourceName: company.sourceName,
          date,
          monthName: monthNameFromDate(date),
          ...emptyMetrics()
        });
      }

      const row = dailyByKey.get(key);
      const type = cleanText(meeting.meeting_type).toLowerCase();
      const status = normalizeCentralMeetingStatus(meeting.status);
      const note = relatedMeetings.notesByMeeting.get(meeting.id) || null;
      const activity = relatedMeetings.activitiesByMeeting.get(meeting.id) || null;
      const pipeline = relatedMeetings.pipelineByMeeting.get(meeting.id) || null;
      const snapshot = relatedMeetings.snapshotsByMeeting.get(meeting.id) || null;
      const pipelineStage = cleanText(snapshot?.pipeline_stage || pipeline?.pipeline_stage || pipelineStageFromStatus(meeting.status));
      if (type === "lender") row.lender += 1;
      if (type === "construction") row.meetingsBooked += 1;
      if (status === "No-show") row.noShows += 1;
      if (status === "Attended") row.meetingsAttended += 1;
      if (status === "Closed") row.closedDeals += 1;

      if (type !== "construction") continue;
      clients.push({
        id: meeting.id || `central-${company.sourceKey}-${date}-${clients.length}`,
        clientName: cleanText(meeting.client_name) || "Unknown client",
        normalizedName: normalizeName(meeting.client_name || ""),
        date,
        monthName: monthNameFromDate(date),
        status,
        sharedStatusRaw: cleanText(meeting.status || ""),
        sharedStatusLabel: status,
        statusSource: cleanText(meeting.status_source || ""),
        statusUpdatedAt: meeting.status_updated_at || meeting.updated_at || "",
        updatedBy: cleanText(meeting.updated_by || ""),
        meetingId: meeting.id || "",
        meetingType: type || "construction",
        ghlContactId: cleanText(meeting.ghl_contact_id || ""),
        ghlOpportunityId: cleanText(meeting.ghl_opportunity_id || ""),
        ghlAppointmentId: cleanText(meeting.ghl_appointment_id || ""),
        pipelineStage,
        pipelineStageLabel: friendlyPipelineStage(pipelineStage, status),
        pipelineStageSource: snapshot?.pipeline_stage ? "ghl_lead_snapshots" : pipeline?.pipeline_stage ? "closer_pipeline" : "meetings.status",
        closerName: cleanText(pipeline?.closer_name || snapshot?.assigned_to_name || ""),
        closerStatus: cleanText(pipeline?.closer_status || ""),
        followUpDate: pipeline?.follow_up_date || snapshot?.follow_up_date || "",
        dealValue: toNumber(pipeline?.deal_value || snapshot?.opportunity_value),
        preApprovedAmount: toNumber(pipeline?.pre_approved_amount),
        lostReason: cleanText(pipeline?.lost_reason || ""),
        latestCloserNote: note ? {
          text: cleanText(note.note_text || ""),
          type: cleanText(note.note_type || ""),
          author: cleanText(note.created_by_name || ""),
          createdAt: note.created_at || ""
        } : null,
        latestActivity: activity ? {
          text: cleanText(activity.activity_text || ""),
          type: cleanText(activity.activity_type || ""),
          source: cleanText(activity.activity_source || ""),
          closerName: cleanText(activity.closer_name || ""),
          activityAt: activity.activity_at || activity.created_at || ""
        } : null,
        sourceKey: company.sourceKey,
        sourceName: company.sourceName,
        appointmentSetter: "Data Entry",
        sheetRow: null,
        transcriptStatus: "Centralized Supabase",
        notes: cleanText(meeting.notes || "")
      });
    }

    return {
      dailyRows: [...dailyByKey.values()].sort((a, b) => a.date.localeCompare(b.date)),
      clients: clients.sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.clientName.localeCompare(b.clientName)),
      recordsProcessed: (Array.isArray(dailyEntries) ? dailyEntries.length : 0) + (Array.isArray(meetings) ? meetings.length : 0)
    };
  } catch (error) {
    console.warn(`Centralized Supabase data was not loaded: ${error.message}`);
    return { dailyRows: [], clients: [], recordsProcessed: 0, error: error.message };
  }
}

async function fetchMeetingRelatedData(meetingIds) {
  const empty = {
    notesByMeeting: new Map(),
    activitiesByMeeting: new Map(),
    pipelineByMeeting: new Map(),
    snapshotsByMeeting: new Map()
  };
  const ids = [...new Set(meetingIds.filter(Boolean))];
  if (!ids.length) return empty;

  const [notes, activities, pipelines, snapshots] = await Promise.all([
    fetchSupabaseRowsByMeetingIds("meeting_notes", "*", ids, "&order=created_at.desc"),
    fetchSupabaseRowsByMeetingIds("ghl_activities", "*", ids, "&order=activity_at.desc.nullslast&order=created_at.desc"),
    fetchSupabaseRowsByMeetingIds("closer_pipeline", "*", ids, "&order=updated_at.desc"),
    fetchSupabaseRowsByMeetingIds("ghl_lead_snapshots", "*", ids, "&order=updated_at.desc")
  ]);

  const preferredNoteTypes = new Set(["closer", "follow_up", "ghl_activity", "plaud_meeting"]);
  for (const note of sortNewest(notes, ["created_at"])) {
    const meetingId = note.meeting_id;
    if (!meetingId || empty.notesByMeeting.has(meetingId)) continue;
    if (!preferredNoteTypes.has(cleanText(note.note_type).toLowerCase())) continue;
    empty.notesByMeeting.set(meetingId, note);
  }
  for (const note of sortNewest(notes, ["created_at"])) {
    const meetingId = note.meeting_id;
    if (meetingId && !empty.notesByMeeting.has(meetingId)) empty.notesByMeeting.set(meetingId, note);
  }
  for (const activity of sortNewest(activities, ["activity_at", "created_at"])) {
    const meetingId = activity.meeting_id;
    if (meetingId && !empty.activitiesByMeeting.has(meetingId)) empty.activitiesByMeeting.set(meetingId, activity);
  }
  for (const pipeline of sortNewest(pipelines, ["updated_at", "created_at"])) {
    const meetingId = pipeline.meeting_id;
    if (meetingId && !empty.pipelineByMeeting.has(meetingId)) empty.pipelineByMeeting.set(meetingId, pipeline);
  }
  for (const snapshot of sortNewest(snapshots, ["updated_at", "synced_at", "created_at"])) {
    const meetingId = snapshot.meeting_id;
    if (meetingId && !empty.snapshotsByMeeting.has(meetingId)) empty.snapshotsByMeeting.set(meetingId, snapshot);
  }

  return empty;
}

async function fetchSupabaseRowsByMeetingIds(table, select, meetingIds, extra = "") {
  const rows = [];
  for (const ids of chunk(meetingIds, 80)) {
    const endpoint = `/rest/v1/${table}?select=${encodeURIComponent(select)}&meeting_id=in.(${ids.join(",")})${extra}`;
    try {
      const payload = await supabaseRequest(endpoint, { method: "GET" });
      if (Array.isArray(payload)) rows.push(...payload);
    } catch (error) {
      console.warn(`Supabase ${table} related rows were not loaded: ${error.message}`);
    }
  }
  return rows;
}

function sortNewest(rows, fields) {
  return [...rows].sort((a, b) => newestTime(b, fields) - newestTime(a, fields));
}

function newestTime(row, fields) {
  for (const field of fields) {
    const value = row?.[field];
    if (!value) continue;
    const time = new Date(value).getTime();
    if (!Number.isNaN(time)) return time;
  }
  return 0;
}

async function attachMetaSpend(dailyRows) {
  const rows = dailyRows.map((row) => ({ adSpend: 0, ...row }));
  if (!rows.length || !hasMetaSpendConfig()) {
    return { dailyRows: rows, live: false, recordsProcessed: 0, errors: [] };
  }

  const dates = rows.map((row) => row.date).filter(Boolean).sort();
  const range = { since: dates[0], until: dates[dates.length - 1] };

  try {
    const spendRows = await fetchMetaSpendRows(range);
    const spendByKey = new Map();
    for (const row of spendRows) {
      const key = `${normalizeMetaSourceKey(row.sourceKey)}:${row.date}`;
      spendByKey.set(key, (spendByKey.get(key) || 0) + toNumber(row.spend));
    }

    for (const row of rows) {
      const key = `${normalizeMetaSourceKey(row.sourceKey)}:${row.date}`;
      row.adSpend = roundMoney(spendByKey.get(key) || 0);
    }

    return { dailyRows: rows, live: true, recordsProcessed: spendRows.length, errors: [] };
  } catch (error) {
    console.warn(`Meta spend was not loaded: ${error.message}`);
    return { dailyRows: rows, live: false, recordsProcessed: 0, errors: [error.message] };
  }
}

function hasMetaSpendConfig() {
  return Object.entries(config.metaAccounts).some(([sourceKey, accountId]) => accountId && config.metaTokens[sourceKey]);
}

async function fetchMetaSpendRows(range) {
  const cacheKey = `${range.since}:${range.until}`;
  const cached = metaSpendCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < metaSpendCacheMs) {
    return cached.rows;
  }

  const results = await Promise.all(Object.entries(config.metaAccounts).map(async ([sourceKey, accountId]) => {
    const token = config.metaTokens[sourceKey];
    if (!accountId || !token) return { rows: [], error: null };

    try {
      const rows = await fetchMetaAccountSummary(sourceKey, accountId, range);
      return { rows, error: null };
    } catch (error) {
      return { rows: [], error: error.message };
    }
  }));

  const rows = results.flatMap((result) => result.rows);
  const errors = results.map((result) => result.error).filter(Boolean);
  if (!rows.length && errors.length) throw new Error(errors.join(" | "));

  metaSpendCache.set(cacheKey, { rows, savedAt: Date.now() });
  return rows;
}

async function fetchMetaAccountSummary(sourceKey, accountId, range) {
  const token = config.metaTokens[sourceKey];
  const account = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const params = new URLSearchParams({
    access_token: token,
    level: "account",
    fields: "spend,reach,impressions,clicks,inline_link_clicks,date_start,date_stop",
    time_increment: "1",
    time_range: JSON.stringify({ since: range.since, until: range.until }),
    limit: "500"
  });
  let url = `https://graph.facebook.com/${config.metaVersion}/${account}/insights?${params}`;
  const rows = [];

  while (url) {
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Meta API request failed for ${sourceNameForKey(sourceKey)}: ${response.status} ${body}`);
    }

    const payload = await response.json();
    rows.push(...(payload.data || []).map((row) => ({
      sourceKey,
      date: row.date_start,
      spend: toNumber(row.spend),
      reach: toNumber(row.reach),
      impressions: toNumber(row.impressions),
      clicks: toNumber(row.clicks),
      linkClicks: toNumber(row.inline_link_clicks)
    })));
    url = payload.paging?.next || "";
  }

  return rows;
}

function normalizeMetaSourceKey(value) {
  const sourceKey = cleanText(value).toLowerCase();
  if (sourceKey === "bryanna-hdz-stb" || sourceKey.includes("south")) return "south-texas-builders";
  if (sourceKey.includes("cuates")) return "cuates";
  return sourceKey;
}

function sourceNameForKey(sourceKey) {
  if (sourceKey === "south-texas-builders") return "South Texas Builders";
  if (sourceKey === "cuates") return "Cuates Construction";
  return sourceKey;
}

function normalizeCentralCompany(company) {
  const slug = cleanText(company.slug).toLowerCase();
  if (slug === "south") return { sourceKey: "south-texas-builders", sourceName: "South Texas Builders" };
  if (slug === "cuates") return { sourceKey: "cuates", sourceName: "Cuates Construction" };
  return {
    sourceKey: slug || normalizeName(company.name || ""),
    sourceName: cleanText(company.name || slug || "Unknown company")
  };
}

function normalizeCentralMeetingStatus(value) {
  const raw = cleanText(value).toLowerCase();
  if (raw === "cerrado") return "Closed";
  if (raw === "no_show") return "No-show";
  if (raw === "atendida") return "Attended";
  if (raw === "reagendo") return "Follow Up";
  if (raw === "descalificado") return "Not Qualified";
  if (raw === "agendada") return "Scheduled";
  return normalizeStatus(value);
}

function pipelineStageFromStatus(value) {
  const raw = cleanText(value).toLowerCase();
  if (raw === "cerrado") return "closed";
  if (raw === "no_show") return "no_show";
  if (raw === "atendida") return "attended";
  if (raw === "reagendo") return "follow_up";
  if (raw === "descalificado") return "not_qualified";
  if (raw === "agendada") return "scheduled";
  return raw;
}

function friendlyPipelineStage(value, fallbackStatus = "Unknown") {
  const raw = cleanText(value).toLowerCase();
  const labels = {
    reunion_agendada_oficina: "Scheduled",
    reunion_agendada_celular: "Scheduled",
    reunion_para_showing: "Scheduled",
    no_show: "No Show",
    contactado_con_tarea: "Need Follow Up",
    en_proceso_aprobacion: "High Potential / Approved",
    lead_potencial: "High Potential / Approved",
    closed: "Closed",
    not_interested: "Not Interested / Not Qualified",
    did_not_approve_mortgage_loan: "Not Interested / Not Qualified",
    contacted: "Need Follow Up",
    follow_up: "Need Follow Up",
    proposal: "High Potential / Approved",
    lost: "Not Interested / Not Qualified",
    new: "Scheduled",
    scheduled: "Scheduled",
    attended: "Attended",
    not_qualified: "Not Interested / Not Qualified"
  };
  return labels[raw] || fallbackStatus || "Unknown";
}

function monthNameFromDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", { month: "long" });
}

async function fetchSheetRows(tab) {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${config.sheetId}/gviz/tq?tqx=out:csv&gid=${tab.gid}`;
  const response = await fetch(csvUrl);

  if (!response.ok) {
    throw new Error(`Google Sheet tab ${tab.name} could not be read: ${response.status}`);
  }

  return parseCsv(await response.text());
}

function parseDailyRows(rows, tab) {
  const maxDay = daysInMonth(tab.year, tab.month);
  const dailyRows = [];

  for (const row of rows.slice(1)) {
    const day = Number(cleanText(row[0]));
    if (!Number.isInteger(day) || day < 1 || day > maxDay) continue;

    const date = `${tab.year}-${String(tab.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    for (const block of metricSourceBlocks) {
      const headers = rows[0] || [];
      const blockTitle = cleanText(headers[block.start]);
      if (!blockTitle) continue;

      const metrics = metricsFromBlock(row, block.start);
      if (!Object.values(metrics).some((value) => value > 0)) continue;

      dailyRows.push({
        sourceKey: block.key,
        sourceName: block.name,
        date,
        monthName: tab.name,
        ...metrics
      });
    }
  }

  return dailyRows;
}

function metricsFromBlock(row, start) {
  return {
    leads: toNumber(row[start]),
    noAnswer: toNumber(row[start + 1]),
    notQualified: toNumber(row[start + 2]),
    qualified: toNumber(row[start + 3]),
    lender: toNumber(row[start + 4]),
    meetingsBooked: toNumber(row[start + 5]),
    noShows: toNumber(row[start + 6]),
    meetingsAttended: toNumber(row[start + 7]),
    closedDeals: toNumber(row[start + 8])
  };
}

function parseClientRows(rows, tab) {
  const clients = [];
  const tables = findClientTables(rows);

  for (const table of tables) {
    for (let rowIndex = table.row + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const clientName = cleanText(row[table.nameColumn]);
      const number = cleanText(row[table.numberColumn]);
      if (!clientName || !/^\d+$/.test(number) || isHeaderish(clientName)) continue;

      const date = parseSheetDate(row[table.dateColumn], tab);
      const status = normalizeStatus(row[table.statusColumn]);
      clients.push({
        id: `${tab.name}-${table.sourceKey}-${rowIndex + 1}-${number}`,
        clientName,
        normalizedName: normalizeName(clientName),
        date,
        monthName: tab.name,
        status,
        sourceKey: table.sourceKey,
        sourceName: table.sourceName,
        appointmentSetter: table.setterName,
        sheetRow: rowIndex + 1,
        transcriptStatus: "Waiting for GHL match"
      });
    }
  }

  return clients.sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.clientName.localeCompare(b.clientName));
}

function findClientTables(rows) {
  const tables = [];

  rows.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (!/reunion\s+agendad/i.test(cleanText(value))) return;
      if (rowIndex < 10) return;

      const numberColumn = findNumberColumn(row, columnIndex);
      const dateColumn = findNearbyColumn(row, columnIndex, /fecha|dia/i) ?? columnIndex + 2;
      const statusColumn = findNearbyColumn(row, columnIndex, /atendida|status|no show|cerrado/i) ?? columnIndex + 3;
      const sourceInfo = inferSourceFromColumn(columnIndex);
      tables.push({
        row: rowIndex,
        numberColumn,
        nameColumn: columnIndex,
        dateColumn,
        statusColumn,
        ...sourceInfo
      });
    });
  });

  return tables;
}

function inferSourceFromColumn(columnIndex) {
  if (columnIndex >= 29) {
    return { sourceKey: "bryanna-hdz-stb", sourceName: "South Texas Builders", setterName: "Bryanna Hdz" };
  }
  if (columnIndex >= 20) {
    return { sourceKey: "cuates", sourceName: "Cuates", setterName: "Unassigned" };
  }
  return { sourceKey: "south-texas-builders", sourceName: "South Texas Builders", setterName: "Unassigned" };
}

function findNumberColumn(row, nameColumn) {
  for (let index = nameColumn - 1; index >= Math.max(0, nameColumn - 3); index -= 1) {
    if (cleanText(row[index]) === "#") return index;
  }

  return Math.max(0, nameColumn - 1);
}

function findNearbyColumn(row, startColumn, pattern) {
  for (let index = startColumn - 1; index <= Math.min(row.length - 1, startColumn + 6); index += 1) {
    if (pattern.test(cleanText(row[index]))) return index;
  }

  return null;
}

export async function syncSheetMetricsToSupabase(dailyRows) {
  if (!hasSupabase()) {
    return { ok: false, message: "Supabase is not configured yet.", recordsProcessed: 0 };
  }

  const payload = dailyRows.map((row) => ({
    source_key: row.sourceKey,
    source_name: row.sourceName,
    metric_date: row.date,
    month_name: row.monthName,
    leads: row.leads,
    no_answer: row.noAnswer,
    not_qualified: row.notQualified,
    qualified: row.qualified,
    lender: row.lender,
    meetings_booked: row.meetingsBooked,
    no_shows: row.noShows,
    meetings_attended: row.meetingsAttended,
    closed_deals: row.closedDeals
  }));

  await supabaseRequest("/rest/v1/sheet_daily_metrics?on_conflict=source_key,metric_date", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(payload)
  });

  return { ok: true, message: "Sheet metrics synced to Supabase.", recordsProcessed: payload.length };
}

async function syncGhl() {
  if (!config.ghlToken || !config.ghlLocationId) {
    return { ok: false, message: "GHL token and location ID are not configured yet.", recordsProcessed: 0 };
  }

  const conversations = await ghlRequest(`/conversations/search?locationId=${encodeURIComponent(config.ghlLocationId)}&limit=50`);
  const conversationRows = extractList(conversations, ["conversations", "data", "items"]);
  const messages = [];
  const transcripts = [];

  for (const conversation of conversationRows.slice(0, 25)) {
    const conversationId = conversation.id || conversation._id;
    if (!conversationId) continue;

    const messagePayload = await ghlRequest(`/conversations/${conversationId}/messages?limit=50`);
    const messageRows = extractList(messagePayload, ["messages.messages", "messages", "data", "items"]);

    for (const message of messageRows) {
      messages.push({ ...message, conversationId });

      const messageId = message.id || message._id;
      if (!messageId || !looksLikeCall(message)) continue;

      const transcript = await tryGetTranscript(messageId);
      if (transcript) transcripts.push({ messageId, contactId: message.contactId || conversation.contactId || "", transcript });
    }
  }

  if (hasSupabase()) {
    await upsertGhlData(conversationRows, messages, transcripts);
  }

  return {
    ok: true,
    message: hasSupabase() ? "GHL conversations synced to Supabase." : "GHL read worked. Add Supabase settings to store results.",
    recordsProcessed: conversationRows.length + messages.length + transcripts.length,
    conversations: conversationRows.length,
    messages: messages.length,
    transcripts: transcripts.length
  };
}

async function fetchRecentTranscripts(sourceKey, limit) {
  const targets = sourceKey === "all"
    ? Object.values(config.ghlLocations).filter((location) => location.token && location.locationId)
    : [config.ghlLocations[sourceKey]].filter((location) => location?.token && location?.locationId);

  if (!targets.length) {
    return {
      ok: false,
      message: "No GHL connection is configured for this company.",
      transcripts: []
    };
  }

  const transcripts = [];
  const errors = [];

  for (const target of targets) {
    try {
      const rows = await fetchLocationTranscripts(target, sourceKey === "all" ? limit : limit - transcripts.length);
      transcripts.push(...rows);
    } catch (error) {
      errors.push(`${target.sourceName}: ${error.message}`);
    }

    if (sourceKey !== "all" && transcripts.length >= limit) break;
  }

  const sorted = sortTranscriptsNewestFirst(transcripts).slice(0, limit);

  return {
    ok: sorted.length > 0 || errors.length === 0,
    message: sorted.length
      ? `Loaded ${sorted.length} transcript${sorted.length === 1 ? "" : "s"}.`
      : "No transcripts found in the recent call messages checked.",
    errors,
    transcripts: sorted
  };
}

async function fetchSavedTranscripts(sourceKey, { limit, from = "", to = "" } = {}) {
  if (!hasSupabase()) {
    return {
      ok: false,
      message: "Supabase is not configured yet.",
      transcripts: []
    };
  }

  const sourceKeys = sourceKey === "all"
    ? Object.keys(config.ghlLocations)
    : [sourceKey];
  const params = new URLSearchParams({
    select: "*",
    order: "date_added.desc",
    limit: String(limit || 80)
  });

  if (sourceKeys.length === 1) {
    params.set("source_key", `eq.${sourceKeys[0]}`);
  } else {
    params.set("source_key", `in.(${sourceKeys.join(",")})`);
  }

  if (from) params.set("date_added", `gte.${from}T00:00:00`);
  if (to) params.append("date_added", `lte.${to}T23:59:59`);

  const rows = await supabaseRequest(`/rest/v1/conversation_transcripts?${params.toString()}`, {
    method: "GET"
  });

  const transcripts = (Array.isArray(rows) ? rows : []).map((row) => ({
    transcriptId: row.id,
    sourceKey: row.source_key || "",
    sourceName: row.source_name || "",
    conversationId: row.conversation_id || "",
    contactId: row.contact_id || "",
    clientName: row.client_name || "Unknown client",
    messageId: row.ghl_message_id || "",
    messageType: row.message_type || "",
    dateAdded: row.date_added || "",
    direction: "",
    callStatus: row.call_status || "",
    callDurationSeconds: row.call_duration_seconds || 0,
    transcriptText: row.transcript_text || "",
    segments: Array.isArray(row.transcript_segments) ? row.transcript_segments : []
  }));

  await attachMessageDirections(transcripts);
  await attachAiReviews(transcripts);

  return {
    ok: true,
    message: transcripts.length
      ? `Loaded ${transcripts.length} saved transcript${transcripts.length === 1 ? "" : "s"} from Supabase.`
      : "No saved transcripts found for this company/date range yet.",
    transcripts
  };
}

export async function analyzeSavedTranscripts(sourceKey, { limit, from = "", to = "" } = {}) {
  if (!hasSupabase()) {
    return { ok: false, message: "Supabase is not configured yet.", recordsProcessed: 0 };
  }

  if (!config.openAiKey) {
    return { ok: false, message: "OpenAI is not configured yet.", recordsProcessed: 0 };
  }

  const fetchLimit = Math.min(300, Math.max(80, Number(limit || 6) * 12));
  const data = await fetchSavedTranscripts(sourceKey, { limit: fetchLimit, from, to });
  const candidates = (data.transcripts || [])
    .filter((item) => item.transcriptId && item.transcriptText)
    .filter(isUsefulTranscriptForAi)
    .filter((item) => !item.aiReview || item.aiReview.reviewVersion !== aiReviewVersion);

  if (!candidates.length) {
    return {
      ok: true,
      message: "No useful saved call transcripts need AI notes right now.",
      recordsProcessed: 0
    };
  }

  const rows = [];
  for (const transcript of candidates.slice(0, limit)) {
    const review = await generateAiReview(transcript);
    rows.push({
      transcript_id: transcript.transcriptId,
      ai_summary: formatAiSummary(review),
      main_objections: cleanTextArray(review.main_objections),
      did_well: [],
      should_improve: review.follow_up_needed ? [cleanText(review.follow_up_needed)].filter(Boolean) : [],
      recommended_next_action: cleanText(review.recommended_next_action) || "Review the transcript and choose the next step.",
      quality_score: null,
      model: `${config.openAiModel}:${aiReviewVersion}`
    });
  }

  if (rows.length) {
    await supabaseRequest("/rest/v1/ai_conversation_reviews", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(rows)
    });
  }

  return {
    ok: true,
    message: `AI added notes to ${rows.length} saved transcript${rows.length === 1 ? "" : "s"}.`,
    recordsProcessed: rows.length
  };
}

async function attachMessageDirections(transcripts) {
  const ids = transcripts.map((item) => item.messageId).filter(Boolean);
  if (!ids.length || !hasSupabase()) return;

  const directionByMessage = new Map();
  for (const group of chunk(ids, 80)) {
    const params = new URLSearchParams({
      select: "id,direction",
      id: `in.(${group.join(",")})`
    });
    const rows = await supabaseRequest(`/rest/v1/ghl_messages?${params.toString()}`, { method: "GET" });
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row.id && row.direction) directionByMessage.set(row.id, cleanText(row.direction));
    }
  }

  for (const transcript of transcripts) {
    transcript.direction = directionByMessage.get(transcript.messageId) || transcript.direction || "";
  }
}

async function attachAiReviews(transcripts) {
  const ids = transcripts.map((item) => item.transcriptId).filter(Boolean);
  if (!ids.length || !hasSupabase()) return;

  const params = new URLSearchParams({
    select: "*",
    transcript_id: `in.(${ids.join(",")})`,
    order: "created_at.desc"
  });
  const rows = await supabaseRequest(`/rest/v1/ai_conversation_reviews?${params.toString()}`, { method: "GET" });
  const reviewByTranscript = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    if (reviewByTranscript.has(row.transcript_id)) continue;
    reviewByTranscript.set(row.transcript_id, {
      summary: row.ai_summary || "",
      objections: Array.isArray(row.main_objections) ? row.main_objections : [],
      didWell: Array.isArray(row.did_well) ? row.did_well : [],
      shouldImprove: Array.isArray(row.should_improve) ? row.should_improve : [],
      nextAction: row.recommended_next_action || "",
      model: row.model || "",
      reviewVersion: String(row.model || "").includes(`${aiReviewVersion}`) ? aiReviewVersion : "legacy",
      createdAt: row.created_at || ""
    });
  }

  for (const transcript of transcripts) {
    transcript.aiReview = reviewByTranscript.get(transcript.transcriptId) || null;
  }
}

async function generateAiReview(transcript) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.openAiModel,
      input: [
        {
          role: "system",
          content: [
            "You review appointment-setting phone call transcripts for a simple sales leadership dashboard.",
            "Use only the transcript and metadata provided.",
            "If the transcript does not prove something, say it is unclear.",
            "Do not invent names, outcomes, objections, promises, appointment statuses, or lead intent.",
            "Do not score, grade, pass, or fail the setter.",
            "For lead_quality, base the label only on buying-readiness signals in the transcript: land/property, financing or budget, timeline, project specificity, and willingness to meet or take a next step.",
            "Classify objections by meaning, not by keywords only.",
            "Keep the output short, direct, and useful for a nontechnical appointment-setting leader."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            client_name: transcript.clientName,
            company: transcript.sourceName,
            call_date: transcript.dateAdded,
            duration_seconds: transcript.callDurationSeconds,
            transcript: transcript.transcriptText.slice(0, 16000)
          })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "appointment_call_review",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "summary",
              "what_happened",
              "follow_up_needed",
              "lead_quality",
              "lead_quality_reason",
              "lead_quality_signals",
              "main_objections",
              "recommended_next_action",
              "confidence",
              "not_enough_information"
            ],
            properties: {
              summary: { type: "string" },
              what_happened: { type: "string" },
              follow_up_needed: { type: "string" },
              lead_quality: { type: "string", enum: ["High", "Medium", "Low", "Unclear"] },
              lead_quality_reason: { type: "string" },
              lead_quality_signals: {
                type: "array",
                items: { type: "string" },
                maxItems: 4
              },
              main_objections: {
                type: "array",
                items: {
                  type: "string",
                  enum: [
                    "Price/Cost",
                    "Financing",
                    "Timing",
                    "Trust/Credibility",
                    "Decision Maker",
                    "Land/Property",
                    "Competition",
                    "Not Ready",
                    "Low Commitment",
                    "Process Confusion",
                    "No Clear Objection",
                    "Unclear"
                  ]
                }
              },
              recommended_next_action: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              not_enough_information: { type: "boolean" }
            }
          }
        }
      }
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI review failed: ${payload.error?.message || response.status}`);
  }

  const outputText = extractOpenAiText(payload);
  try {
    return JSON.parse(outputText);
  } catch {
    throw new Error("OpenAI returned review notes in an unreadable format.");
  }
}

function extractOpenAiText(payload) {
  if (payload.output_text) return payload.output_text;
  const parts = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n");
}

async function translateTranscriptToSpanish(messageId) {
  if (!config.openAiKey) {
    return { ok: false, message: "OpenAI is not configured yet.", translation: "" };
  }

  if (!hasSupabase()) {
    return { ok: false, message: "Supabase is not configured yet.", translation: "" };
  }

  if (!messageId) {
    return { ok: false, message: "Transcript message ID is required.", translation: "" };
  }

  const rows = await supabaseRequest(
    `/rest/v1/conversation_transcripts?select=client_name,source_name,date_added,transcript_text&ghl_message_id=eq.${encodeURIComponent(messageId)}&limit=1`,
    { method: "GET" }
  );
  const transcript = Array.isArray(rows) ? rows[0] : null;
  if (!transcript?.transcript_text) {
    return { ok: false, message: "No saved transcript text found to translate.", translation: "" };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.openAiModel,
      input: [
        {
          role: "system",
          content: "Translate call transcripts into clear, natural Spanish. Preserve names, dates, phone numbers, company names, and meaning. Do not summarize or add commentary."
        },
        {
          role: "user",
          content: JSON.stringify({
            client_name: transcript.client_name || "",
            company: transcript.source_name || "",
            date: transcript.date_added || "",
            transcript: transcript.transcript_text.slice(0, 18000)
          })
        }
      ]
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI translation failed: ${payload.error?.message || response.status}`);
  }

  return {
    ok: true,
    message: "Spanish transcript generated.",
    translation: extractOpenAiText(payload)
  };
}

async function translateNotesToSpanish(notes) {
  if (!config.openAiKey) {
    return { ok: false, message: "OpenAI is not configured yet.", translation: null };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.openAiModel,
      input: [
        {
          role: "system",
          content: "Translate appointment-setting AI review notes into clear, natural Spanish. Preserve names, company names, dates, and meaning. Do not add new information."
        },
        {
          role: "user",
          content: JSON.stringify({
            summary: cleanText(notes.summary || ""),
            longSummary: cleanText(notes.longSummary || ""),
            objections: cleanText(notes.objections || ""),
            followUpNeeded: cleanText(notes.followUpNeeded || ""),
            nextAction: cleanText(notes.nextAction || "")
          })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "spanish_ai_notes",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["summary", "longSummary", "objections", "followUpNeeded", "nextAction"],
            properties: {
              summary: { type: "string" },
              longSummary: { type: "string" },
              objections: { type: "string" },
              followUpNeeded: { type: "string" },
              nextAction: { type: "string" }
            }
          }
        }
      }
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI notes translation failed: ${payload.error?.message || response.status}`);
  }

  return {
    ok: true,
    message: "Spanish AI notes generated.",
    translation: JSON.parse(extractOpenAiText(payload))
  };
}

async function generateDailyExecutiveSummary(input) {
  if (!config.openAiKey) {
    return { ok: false, message: "OpenAI is not configured yet.", summary: null };
  }

  const activity = Array.isArray(input.activity) ? input.activity.slice(0, 80) : [];
  const metrics = input.metrics || {};

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.openAiModel,
      input: [
        {
          role: "system",
          content: [
            "Write a short daily operating report for an appointment-setting leader.",
            "Write in clear, simple English.",
            "Use only the provided metrics.",
            "Do not invent clients, outcomes, counts, objections, intent, or performance claims.",
            "Do not mention leads for the period if leads are not provided in the metrics.",
            "Focus on the report period as a daily operating update, not a monthly dashboard.",
            "Keep it extremely short: one paragraph and at most three short bullet points.",
            "Avoid coaching language and avoid rating individual appointment setters."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            company: cleanText(input.company || ""),
            date_label: cleanText(input.dateLabel || ""),
            metrics,
            top_objections: Array.isArray(input.topObjections) ? input.topObjections : [],
            activity: activity.map((item) => ({
              company: cleanText(item.sourceName || ""),
              type: cleanText(item.kind || ""),
              channel: cleanText(item.typeLabel || ""),
              direction: cleanText(item.direction || ""),
              time: cleanText(item.dateAdded || ""),
              summary: cleanText(item.summary || ""),
              message: cleanText(item.body || "").slice(0, 700),
              objections: Array.isArray(item.objections) ? item.objections.map(cleanText).slice(0, 4) : [],
              lead_quality: cleanText(item.leadQuality || "")
            }))
          })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "coo_daily_appointment_summary",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["executive_summary", "operational_readout", "risk_signals", "priority_actions", "leader_note"],
            properties: {
              executive_summary: { type: "string", description: "One paragraph, max 55 words, in plain English." },
              operational_readout: { type: "array", maxItems: 2, items: { type: "string" }, description: "At most two clear points about period numbers." },
              risk_signals: { type: "array", maxItems: 1, items: { type: "string" }, description: "At most one risk if there is evidence." },
              priority_actions: { type: "array", maxItems: 1, items: { type: "string" }, description: "At most one priority focus." },
              leader_note: { type: "string", description: "One short closing sentence." }
            }
          }
        }
      }
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI daily summary failed: ${payload.error?.message || response.status}`);
  }

  return {
    ok: true,
    message: "Executive daily summary generated.",
    summary: JSON.parse(extractOpenAiText(payload))
  };
}

function formatAiSummary(review) {
  const lines = [
    review.summary ? `Summary: ${cleanText(review.summary)}` : "",
    review.what_happened ? `What happened: ${cleanText(review.what_happened)}` : "",
    review.lead_quality ? `Lead quality: ${cleanText(review.lead_quality)}` : "",
    review.lead_quality_reason ? `Lead quality reason: ${cleanText(review.lead_quality_reason)}` : "",
    Array.isArray(review.lead_quality_signals) && review.lead_quality_signals.length ? `Lead quality signals: ${review.lead_quality_signals.map((item) => cleanText(item)).filter(Boolean).join("; ")}` : "",
    review.confidence ? `Confidence: ${cleanText(review.confidence)}` : "",
    review.not_enough_information ? "Some details were unclear from the transcript." : ""
  ].filter(Boolean);
  return lines.join("\n");
}

function cleanTextArray(value) {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter(Boolean).slice(0, 5)
    : [];
}

export async function syncTranscriptsToSupabase(sourceKey, limit) {
  if (!hasSupabase()) {
    return { ok: false, message: "Supabase is not configured yet.", recordsProcessed: 0 };
  }

  const startedAt = new Date().toISOString();

  try {
    const data = await fetchRecentTranscripts(sourceKey, limit);
    const transcripts = data.transcripts || [];
    if (!transcripts.length) {
      await recordSyncRun({
        syncType: `transcripts:${sourceKey}`,
        status: "success",
        startedAt,
        recordsProcessed: 0
      });
      return { ok: true, message: "No transcripts found to sync.", recordsProcessed: 0 };
    }

    await saveTranscriptsToSupabase(transcripts);
    await recordSyncRun({
      syncType: `transcripts:${sourceKey}`,
      status: "success",
      startedAt,
      recordsProcessed: transcripts.length
    });

    return {
      ok: true,
      message: `Synced ${transcripts.length} transcript${transcripts.length === 1 ? "" : "s"} to Supabase.`,
      recordsProcessed: transcripts.length
    };
  } catch (error) {
    await recordSyncRun({
      syncType: `transcripts:${sourceKey}`,
      status: "failed",
      startedAt,
      recordsProcessed: 0,
      errorMessage: error.message
    });
    throw error;
  }
}

export async function backfillCallDirections(sourceKey, limit = 80) {
  if (!hasSupabase()) {
    return { ok: false, message: "Supabase is not configured yet.", recordsProcessed: 0 };
  }

  const startedAt = new Date().toISOString();
  const data = await fetchSavedTranscripts(sourceKey, { limit });
  const candidates = (data.transcripts || [])
    .filter((item) => !item.direction && item.messageId && item.conversationId && item.sourceKey)
    .slice(0, limit);
  const updates = [];

  for (const item of candidates) {
    const target = config.ghlLocations[item.sourceKey];
    if (!target?.token || !target?.locationId) continue;

    try {
      const payload = await ghlRequestFor(target, `/conversations/${encodeURIComponent(item.conversationId)}/messages?limit=100`);
      const messages = extractList(payload, ["messages.messages", "messages", "data", "items"]);
      const message = messages.find((row) => (row.id || row._id) === item.messageId);
      const direction = getMessageDirection(message || {});
      if (!direction) continue;

      updates.push({
        id: item.messageId,
        conversation_id: item.conversationId,
        contact_id: item.contactId || null,
        direction,
        message_type: item.messageType || null,
        call_status: item.callStatus || null,
        call_duration_seconds: item.callDurationSeconds || 0,
        date_added: item.dateAdded || null,
        raw: {
          sourceKey: item.sourceKey,
          sourceName: item.sourceName,
          clientName: item.clientName,
          directionBackfilledAt: new Date().toISOString()
        }
      });
    } catch {
      // Keep the dashboard fast and continue with the next saved call.
    }
  }

  if (updates.length) {
    await supabaseRequest("/rest/v1/ghl_messages?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(dedupeBy(updates, "id"))
    });
  }

  await recordSyncRun({
    syncType: `call-directions:${sourceKey}`,
    status: "success",
    startedAt,
    recordsProcessed: updates.length
  });

  return {
    ok: true,
    message: updates.length
      ? `Backfilled ${updates.length} call direction${updates.length === 1 ? "" : "s"}.`
      : "No missing call directions were found in the checked saved calls.",
    recordsProcessed: updates.length
  };
}

async function fetchLocationTranscripts(target, limit) {
  if (limit <= 0) return [];

  const conversations = await ghlRequestFor(
    target,
    `/conversations/search?locationId=${encodeURIComponent(target.locationId)}&limit=35`
  );
  const conversationRows = extractList(conversations, ["conversations", "data", "items"]);
  const transcripts = [];
  const candidateLimit = Math.max(limit, 20);

  for (const conversation of conversationRows) {
    const conversationId = conversation.id || conversation._id;
    if (!conversationId) continue;

    const messagePayload = await ghlRequestFor(target, `/conversations/${conversationId}/messages?limit=35`);
    const messages = extractList(messagePayload, ["messages.messages", "messages", "data", "items"]);

    const sortedMessages = [...messages].sort((a, b) => new Date(b.dateAdded || b.createdAt || 0) - new Date(a.dateAdded || a.createdAt || 0));

    for (const message of sortedMessages) {
      if (!isCallMessage(message)) continue;

      const messageId = message.id || message._id;
      if (!messageId) continue;
      if (!isUsefulCallMessageForTranscript(message)) continue;

      const transcript = await tryGetTranscriptFor(target, messageId);
      if (!transcript?.segments?.length) continue;

      transcripts.push({
        sourceKey: target.sourceKey,
        sourceName: target.sourceName,
        conversationId,
        contactId: message.contactId || conversation.contactId || "",
        clientName: conversation.contactName || conversation.fullName || conversation.contact?.name || "Unknown client",
        messageId,
        messageType: message.messageType || String(message.type || ""),
        direction: getMessageDirection(message),
        dateAdded: message.dateAdded || message.createdAt || "",
        callStatus: getCallStatus(message),
        callDurationSeconds: getCallDurationSeconds(message),
        transcriptText: transcript.text,
        segments: transcript.segments
      });

      if (transcripts.length >= candidateLimit) {
        return sortTranscriptsNewestFirst(transcripts).slice(0, limit);
      }
    }
  }

  return sortTranscriptsNewestFirst(transcripts).slice(0, limit);
}

async function fetchClientNotes(sourceKey, clientName) {
  const target = config.ghlLocations[sourceKey];
  if (!target?.token || !target?.locationId) {
    return { ok: false, message: "No GHL connection is configured for this company.", notes: [] };
  }

  if (!clientName.trim()) {
    return { ok: false, message: "Client name is required.", notes: [] };
  }

  const searchPayload = await ghlRequestFor(
    target,
    `/contacts/?locationId=${encodeURIComponent(target.locationId)}&query=${encodeURIComponent(clientName)}&limit=10`
  );
  const contacts = extractList(searchPayload, ["contacts", "data", "items"]);
  const contact = findBestContactMatch(contacts, clientName);

  if (!contact) {
    return {
      ok: true,
      message: `No GHL contact found for ${clientName}.`,
      contact: null,
      notes: []
    };
  }

  const contactId = contact.id || contact._id;
  const notesPayload = await ghlRequestFor(target, `/contacts/${encodeURIComponent(contactId)}/notes`);
  const notes = extractList(notesPayload, ["notes", "data", "items"]).map((note) => ({
    id: note.id || note._id || "",
    title: cleanText(note.title || ""),
    body: cleanNoteBody(note.bodyText || note.body || ""),
    dateAdded: note.dateAdded || "",
    pinned: Boolean(note.pinned)
  })).filter((note) => note.body || note.title);

  return {
    ok: true,
    message: notes.length
      ? `Loaded ${notes.length} GHL note${notes.length === 1 ? "" : "s"} for ${clientName}.`
      : `No GHL notes found for ${clientName}.`,
    contact: {
      id: contactId,
      name: contact.contactName || contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(" ") || clientName
    },
    notes
  };
}

async function fetchClientActivity(sourceKey, clientName) {
  const target = config.ghlLocations[sourceKey];
  if (!target?.token || !target?.locationId) {
    return { ok: false, message: "No GHL connection is configured for this company.", notes: [], messages: [] };
  }

  if (!clientName.trim()) {
    return { ok: false, message: "Client name is required.", notes: [], messages: [] };
  }

  const searchPayload = await ghlRequestFor(
    target,
    `/contacts/?locationId=${encodeURIComponent(target.locationId)}&query=${encodeURIComponent(clientName)}&limit=10`
  );
  const contacts = extractList(searchPayload, ["contacts", "data", "items"]);
  const contact = findBestContactMatch(contacts, clientName);

  if (!contact) {
    return {
      ok: true,
      message: `No GHL contact found for ${clientName}.`,
      contact: null,
      notes: [],
      messages: []
    };
  }

  const contactId = contact.id || contact._id;
  const notes = await fetchContactNotes(target, contactId);
  const messages = await fetchContactMessages(target, contactId);

  return {
    ok: true,
    message: `Loaded ${notes.length} note${notes.length === 1 ? "" : "s"} and ${messages.length} message${messages.length === 1 ? "" : "s"} for ${clientName}.`,
    contact: {
      id: contactId,
      name: contact.contactName || contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(" ") || clientName
    },
    notes,
    messages
  };
}

async function fetchDailyActivity(sourceKey, { from = "", to = "", limit = 150 } = {}) {
  const targets = sourceKey === "all"
    ? Object.values(config.ghlLocations).filter((target) => target.token && target.locationId)
    : [config.ghlLocations[sourceKey]].filter((target) => target?.token && target?.locationId);

  if (!targets.length) {
    return { ok: false, message: "No GHL connection is configured for this company.", activity: [] };
  }

  const rows = [];
  const errors = [];
  for (const target of targets) {
    try {
      rows.push(...await fetchLocationActivity(target, { from, to, limit: Math.ceil(limit / targets.length) }));
    } catch (error) {
      if (sourceKey !== "all") throw error;
      errors.push(`${target.sourceName || target.sourceKey}: ${error.message}`);
    }
  }

  const activity = rows
    .filter((row) => isWithinDateRange(row.dateAdded, from, to))
    .sort((a, b) => new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0))
    .slice(0, limit);

  return {
    ok: true,
    message: errors.length
      ? `Loaded ${activity.length} GHL activit${activity.length === 1 ? "y" : "ies"}; ${errors.length} connection${errors.length === 1 ? "" : "s"} failed.`
      : `Loaded ${activity.length} GHL activit${activity.length === 1 ? "y" : "ies"}.`,
    warnings: errors,
    activity
  };
}

async function fetchActivityStats(sourceKey, { from = "", to = "", limit = 500 } = {}) {
  const data = await fetchDailyActivity(sourceKey, { from, to, limit });
  if (data.ok === false) return { ...data, stats: emptyActivityStats(), from, to };

  const stats = emptyActivityStats();
  for (const item of data.activity || []) {
    const direction = getMessageDirection(item);
    const inbound = direction.includes("inbound");
    const outbound = direction.includes("outbound");
    const isCall = item.kind === "call" || looksLikeCall(item);

    if (isCall) {
      if (inbound) stats.inboundCalls += 1;
      else if (outbound) stats.outboundCalls += 1;
      else stats.unknownCalls += 1;
    } else {
      if (inbound) stats.inboundMessages += 1;
      else if (outbound) stats.outboundMessages += 1;
      else stats.unknownMessages += 1;
    }
  }

  stats.speedToCall = await fetchSpeedToCallStats(sourceKey, { from, to }).catch((error) => ({
    ...emptySpeedToCallStats(),
    error: error.message
  }));

  return {
    ok: true,
    message: `Loaded activity tracker counts for ${from === to ? from : `${from} to ${to}`}.`,
    from,
    to,
    recordsProcessed: (data.activity || []).length,
    stats
  };
}

function emptyActivityStats() {
  return {
    inboundMessages: 0,
    inboundCalls: 0,
    outboundMessages: 0,
    outboundCalls: 0,
    unknownMessages: 0,
    unknownCalls: 0,
    speedToCall: emptySpeedToCallStats()
  };
}

function emptySpeedToCallStats() {
  return {
    tracked: 0,
    called: 0,
    waiting: 0,
    under5: 0,
    under15: 0,
    overdue: 0,
    averageMinutes: null,
    medianMinutes: null,
    rows: [],
    basis: "ghl-stage-change-snapshot"
  };
}

async function fetchSpeedToCallStats(sourceKey, { from = "", to = "" } = {}) {
  if (!hasSupabase()) return emptySpeedToCallStats();

  const companyRows = await supabaseRequest("/rest/v1/companies?select=id,slug,name,active&active=eq.true", { method: "GET" });
  const companies = (Array.isArray(companyRows) ? companyRows : [])
    .map((company) => ({ id: company.id, ...normalizeCentralCompany(company) }))
    .filter((company) => sourceKey === "all" || company.sourceKey === sourceKey);
  const companyIds = companies.map((company) => company.id).filter(Boolean);
  if (!companyIds.length) return emptySpeedToCallStats();

  const snapshots = await fetchSupabaseRowsByField(
    "ghl_lead_snapshots",
    "id,meeting_id,company_id,ghl_contact_id,pipeline_stage,pipeline_stage_name,meeting_status,last_activity_at,last_note,synced_at,updated_at,raw_payload",
    "company_id",
    companyIds,
    "&order=updated_at.desc"
  );
  const pendingRows = snapshots
    .filter(isPendingCallSnapshot)
    .map((snapshot) => ({
      ...snapshot,
      pendingCallAt: getPendingCallAtFromSnapshot(snapshot)
    }))
    .filter((snapshot) => snapshot.ghl_contact_id && snapshot.pendingCallAt)
    .filter((snapshot) => isWithinDateRange(snapshot.pendingCallAt, from, to));

  if (!pendingRows.length) return emptySpeedToCallStats();

  const contactIds = [...new Set(pendingRows.map((row) => row.ghl_contact_id).filter(Boolean))];
  const messages = await fetchSupabaseRowsByField(
    "ghl_messages",
    "id,contact_id,direction,message_type,call_status,call_duration_seconds,date_added,raw",
    "contact_id",
    contactIds,
    "&order=date_added.asc"
  );
  const callsByContact = groupOutboundCallsByContact(messages);
  const now = new Date();
  const rows = pendingRows.map((snapshot) => {
    const pendingAt = new Date(snapshot.pendingCallAt);
    const firstCall = (callsByContact.get(snapshot.ghl_contact_id) || [])
      .find((message) => new Date(message.date_added || 0) >= pendingAt);
    const minutes = firstCall ? minutesBetween(snapshot.pendingCallAt, firstCall.date_added) : null;
    const waitingMinutes = firstCall ? null : Math.max(0, minutesBetween(snapshot.pendingCallAt, now.toISOString()));
    return {
      meetingId: snapshot.meeting_id || "",
      contactId: snapshot.ghl_contact_id || "",
      pendingCallAt: snapshot.pendingCallAt,
      firstCallAt: firstCall?.date_added || "",
      minutes,
      waitingMinutes,
      stage: cleanText(snapshot.pipeline_stage_name || snapshot.pipeline_stage || snapshot.meeting_status || "Pendiente llamada")
    };
  });
  const calledRows = rows.filter((row) => Number.isFinite(row.minutes));
  const minutes = calledRows.map((row) => row.minutes).sort((a, b) => a - b);

  return {
    tracked: rows.length,
    called: calledRows.length,
    waiting: rows.length - calledRows.length,
    under5: calledRows.filter((row) => row.minutes <= 5).length,
    under15: calledRows.filter((row) => row.minutes <= 15).length,
    overdue: rows.filter((row) => Number.isFinite(row.minutes) ? row.minutes > 15 : (row.waitingMinutes || 0) > 15).length,
    averageMinutes: minutes.length ? Math.round((minutes.reduce((total, value) => total + value, 0) / minutes.length) * 10) / 10 : null,
    medianMinutes: median(minutes),
    rows: rows
      .sort((a, b) => (b.waitingMinutes || b.minutes || 0) - (a.waitingMinutes || a.minutes || 0))
      .slice(0, 8),
    basis: "ghl-stage-change-snapshot"
  };
}

function isPendingCallSnapshot(snapshot) {
  const haystack = [
    snapshot.pipeline_stage,
    snapshot.pipeline_stage_name,
    snapshot.meeting_status,
    snapshot.last_note
  ].map((value) => cleanText(value).toLowerCase()).join(" ");
  return [
    "pendiente llamada",
    "pendiente de llamada",
    "pendiente_llamada",
    "pendiente-llamada",
    "pending phone call",
    "pending call",
    "pending_call",
    "pending-call",
    "call pending"
  ].some((term) => haystack.includes(term));
}

function getPendingCallAtFromSnapshot(snapshot) {
  const raw = snapshot.raw_payload || {};
  return raw.lastStageChangeAt
    || raw.lastStatusChangeAt
    || snapshot.last_activity_at
    || snapshot.updated_at
    || snapshot.synced_at
    || "";
}

async function fetchSupabaseRowsByField(table, select, field, values, extra = "") {
  const rows = [];
  for (const batch of chunk([...new Set(values.filter(Boolean))], 80)) {
    const endpoint = `/rest/v1/${table}?select=${encodeURIComponent(select)}&${field}=in.(${batch.join(",")})${extra}`;
    const payload = await supabaseRequest(endpoint, { method: "GET" });
    if (Array.isArray(payload)) rows.push(...payload);
  }
  return rows;
}

function groupOutboundCallsByContact(messages) {
  const grouped = new Map();
  for (const message of messages) {
    if (!message.contact_id || !message.date_added || !isDbCallMessage(message)) continue;
    const direction = getMessageDirection(message);
    if (!direction.includes("outbound")) continue;
    const rows = grouped.get(message.contact_id) || [];
    rows.push(message);
    grouped.set(message.contact_id, rows);
  }
  for (const rows of grouped.values()) {
    rows.sort((a, b) => new Date(a.date_added || 0) - new Date(b.date_added || 0));
  }
  return grouped;
}

function isDbCallMessage(message) {
  const type = cleanText(message.message_type || message.type || "").toLowerCase();
  return type.includes("call") || Boolean(message.call_status) || toNumber(message.call_duration_seconds) > 0;
}

function minutesBetween(start, end) {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return null;
  return Math.max(0, Math.round(((endTime - startTime) / 60000) * 10) / 10);
}

function median(values) {
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2
    ? values[middle]
    : Math.round(((values[middle - 1] + values[middle]) / 2) * 10) / 10;
}

async function fetchLocationActivity(target, { from = "", to = "", limit = 150 } = {}) {
  const conversationLimit = Math.min(25, Math.max(10, Math.ceil(limit / 4)));
  const conversationPayload = await ghlRequestFor(
    target,
    `/conversations/search?locationId=${encodeURIComponent(target.locationId)}&limit=${conversationLimit}`
  );
  const conversations = extractList(conversationPayload, ["conversations", "data", "items"]);
  const rows = [];

  for (const conversation of conversations) {
    const conversationId = conversation.id || conversation._id;
    if (!conversationId) continue;

    const messagePayload = await ghlRequestFor(target, `/conversations/${encodeURIComponent(conversationId)}/messages?limit=25`);
    const messages = extractList(messagePayload, ["messages.messages", "messages", "data", "items"]);

    for (const message of messages) {
      const formatted = formatGhlMessage(message, conversationId);
      const dateAdded = formatted.dateAdded || message.dateAdded || message.createdAt || "";
      if (!isWithinDateRange(dateAdded, from, to)) continue;

      const isCall = isCallMessage(message);

      rows.push({
        ...formatted,
        sourceKey: target.sourceKey,
        sourceName: target.sourceName,
        clientName: conversation.contactName || conversation.fullName || conversation.contact?.name || message.contactName || "Unknown client",
        contactId: message.contactId || conversation.contactId || "",
        kind: isCall ? "call" : "message",
        transcriptText: "",
        segments: [],
        callDurationSeconds: toNumber(message.meta?.call?.duration || message.callDuration || message.meta?.callDuration),
        callStatus: cleanText(message.meta?.call?.status || message.callStatus || formatted.status || "")
      });

      if (rows.length >= limit) return rows;
    }
  }

  return rows;
}

async function fetchContactNotes(target, contactId) {
  const notesPayload = await ghlRequestFor(target, `/contacts/${encodeURIComponent(contactId)}/notes`);
  return extractList(notesPayload, ["notes", "data", "items"]).map((note) => ({
    id: note.id || note._id || "",
    title: cleanText(note.title || ""),
    body: cleanNoteBody(note.bodyText || note.body || ""),
    dateAdded: note.dateAdded || "",
    pinned: Boolean(note.pinned)
  })).filter((note) => note.body || note.title);
}

async function fetchContactMessages(target, contactId) {
  const conversationPayload = await ghlRequestFor(
    target,
    `/conversations/search?locationId=${encodeURIComponent(target.locationId)}&contactId=${encodeURIComponent(contactId)}&limit=10`
  );
  const conversations = extractList(conversationPayload, ["conversations", "data", "items"]);
  const messages = [];

  for (const conversation of conversations) {
    const conversationId = conversation.id || conversation._id;
    if (!conversationId) continue;

    const messagePayload = await ghlRequestFor(target, `/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`);
    const rows = extractList(messagePayload, ["messages.messages", "messages", "data", "items"]);
    messages.push(...rows.map((message) => formatGhlMessage(message, conversationId)));
  }

  return messages
    .filter((message) => message.id)
    .sort((a, b) => new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0))
    .slice(0, 100);
}

function formatGhlMessage(message, conversationId) {
  const type = cleanText(message.messageType || message.type || "");
  const body = cleanNoteBody(message.body || message.text || message.message || message.subject || "");
  return {
    id: message.id || message._id || "",
    conversationId,
    type,
    typeLabel: cleanText(type.replace(/^TYPE_/i, "").replace(/_/g, " ").toLowerCase()) || "message",
    direction: getMessageDirection(message),
    body: body || messageTypeFallback(type),
    dateAdded: message.dateAdded || message.createdAt || "",
    status: cleanText(message.status || message.callStatus || message.meta?.call?.status || "")
  };
}

function messageTypeFallback(type) {
  const raw = String(type || "").toLowerCase();
  if (raw.includes("call")) return "Call activity";
  if (raw.includes("email")) return "Email activity";
  if (raw.includes("sms")) return "Text message activity";
  return "Message activity";
}

function isWithinDateRange(value, from, to) {
  const key = dateKey(value);
  if (!key) return !from && !to;
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

function dateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function findBestContactMatch(contacts, clientName) {
  const target = normalizeName(clientName);
  if (!target) return null;

  const scored = contacts.map((contact) => {
    const name = normalizeName(contact.contactName || contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(" "));
    const score = name === target ? 3 : name.includes(target) || target.includes(name) ? 2 : commonNameParts(name, target);
    return { contact, score };
  }).filter((item) => item.score > 0);

  return scored.sort((a, b) => b.score - a.score)[0]?.contact || contacts[0] || null;
}

function commonNameParts(a, b) {
  const aParts = new Set(a.split(" ").filter((part) => part.length > 2));
  const bParts = b.split(" ").filter((part) => part.length > 2);
  return bParts.filter((part) => aParts.has(part)).length;
}

function cleanNoteBody(value) {
  return cleanText(String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'"));
}

async function upsertGhlData(conversations, messages, transcripts) {
  if (conversations.length) {
    await supabaseRequest("/rest/v1/ghl_conversations?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(conversations.map((conversation) => ({
        id: conversation.id || conversation._id,
        location_id: config.ghlLocationId,
        contact_id: conversation.contactId || null,
        assigned_to: conversation.assignedTo || conversation.assignedUserId || null,
        last_message_date: conversation.lastMessageDate || conversation.dateUpdated || null,
        raw: conversation
      })).filter((row) => row.id))
    });
  }

  if (messages.length) {
    await supabaseRequest("/rest/v1/ghl_messages?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(messages.map((message) => ({
        id: message.id || message._id,
        conversation_id: message.conversationId,
        contact_id: message.contactId || null,
        direction: message.direction || null,
        message_type: String(message.type || message.messageType || ""),
        body: message.body || null,
        call_status: message.callStatus || message.meta?.callStatus || null,
        call_duration_seconds: toNumber(message.callDuration || message.meta?.callDuration),
        date_added: message.dateAdded || message.createdAt || null,
        raw: message
      })).filter((row) => row.id && row.conversation_id))
    });
  }

  if (transcripts.length) {
    await supabaseRequest("/rest/v1/conversation_transcripts?on_conflict=ghl_message_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(transcripts.map((item) => ({
        ghl_message_id: item.messageId,
        contact_id: item.contactId || null,
        transcript_text: item.transcript.text || null,
        transcript_url: item.transcript.url || null,
        source: "ghl"
      })))
    });
  }
}

async function saveTranscriptsToSupabase(transcripts) {
  const conversations = transcripts.map((item) => ({
    id: item.conversationId,
    location_id: config.ghlLocations[item.sourceKey]?.locationId || null,
    contact_id: item.contactId || null,
    assigned_to: null,
    last_message_date: item.dateAdded || null,
    raw: {
      sourceKey: item.sourceKey,
      sourceName: item.sourceName,
      clientName: item.clientName
    }
  })).filter((row) => row.id);

  const messages = transcripts.map((item) => ({
    id: item.messageId,
    conversation_id: item.conversationId,
    contact_id: item.contactId || null,
    direction: item.direction || null,
    message_type: item.messageType || null,
    body: null,
    call_status: item.callStatus || null,
    call_duration_seconds: item.callDurationSeconds || 0,
    date_added: item.dateAdded || null,
    raw: {
      sourceKey: item.sourceKey,
      sourceName: item.sourceName,
      clientName: item.clientName
    }
  })).filter((row) => row.id && row.conversation_id);

  const transcriptRows = transcripts.map((item) => ({
    ghl_message_id: item.messageId,
    contact_id: item.contactId || null,
    conversation_id: item.conversationId || null,
    source_key: item.sourceKey,
    source_name: item.sourceName,
    client_name: item.clientName,
    message_type: item.messageType || null,
    call_status: item.callStatus || null,
    call_duration_seconds: item.callDurationSeconds || 0,
    date_added: item.dateAdded || null,
    transcript_text: item.transcriptText || null,
    transcript_segments: item.segments || [],
    source: "ghl"
  })).filter((row) => row.ghl_message_id);

  await supabaseRequest("/rest/v1/ghl_conversations?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(dedupeBy(conversations, "id"))
  });

  await supabaseRequest("/rest/v1/ghl_messages?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(dedupeBy(messages, "id"))
  });

  await supabaseRequest("/rest/v1/conversation_transcripts?on_conflict=ghl_message_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(dedupeBy(transcriptRows, "ghl_message_id"))
  });
}

export async function recordSyncRun({ syncType, status, startedAt, recordsProcessed, errorMessage = "" }) {
  if (!hasSupabase()) return;

  await supabaseRequest("/rest/v1/sync_runs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{
      sync_type: syncType,
      status,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      records_processed: recordsProcessed,
      error_message: errorMessage || null
    }])
  });
}

async function tryGetTranscript(messageId) {
  const candidates = [
    `/conversations/messages/${messageId}/transcription`,
    `/conversations/messages/${messageId}/transcription/download`
  ];

  for (const endpoint of candidates) {
    try {
      const payload = await ghlRequest(endpoint);
      const text = typeof payload === "string" ? payload : payload.transcription || payload.transcript || payload.text || "";
      const url = typeof payload === "object" ? payload.url || payload.downloadUrl || "" : "";
      if (text || url) return { text, url };
    } catch {
      // Some messages are not calls or do not have transcription enabled.
    }
  }

  return null;
}

async function tryGetTranscriptFor(target, messageId) {
  try {
    const payload = await ghlRequestFor(
      target,
      `/conversations/locations/${encodeURIComponent(target.locationId)}/messages/${encodeURIComponent(messageId)}/transcription`,
      "2023-02-21"
    );
    const segments = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.transcription)
        ? payload.transcription
        : Array.isArray(payload?.transcript)
          ? payload.transcript
          : [];
    const text = segments
      .map((segment) => cleanText(segment.transcript || segment.text || ""))
      .filter(Boolean)
      .join(" ");

    return { segments, text };
  } catch {
    return null;
  }
}

async function ghlRequest(endpoint) {
  const response = await fetch(`${config.ghlApiBase}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${config.ghlToken}`,
      Version: config.ghlApiVersion,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`GHL request failed: ${response.status} ${await response.text()}`);
  }

  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function ghlRequestFor(target, endpoint, version = config.ghlApiVersion) {
  const response = await fetch(`${config.ghlApiBase}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${target.token}`,
      Version: version,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`GHL request failed: ${response.status} ${await response.text()}`);
  }

  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function supabaseRequest(endpoint, options = {}) {
  const response = await fetch(`${config.supabaseUrl}${endpoint}`, {
    ...options,
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed: ${response.status} ${await response.text()}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function groupClientsBySetter(clients) {
  const groups = new Map();
  for (const client of clients) {
    const key = client.appointmentSetter || "Unassigned";
    const current = groups.get(key) || {
      label: key,
      clients: 0,
      attended: 0,
      noShows: 0,
      closedDeals: 0
    };

    current.clients += 1;
    if (client.status === "Attended") current.attended += 1;
    if (client.status === "No-show") current.noShows += 1;
    if (client.status === "Closed") current.closedDeals += 1;
    groups.set(key, current);
  }

  return [...groups.values()].map((row) => ({
    ...row,
    attendanceRate: safeDivide(row.attended, row.clients),
    closeRate: safeDivide(row.closedDeals, row.clients)
  }));
}

function sortTranscriptsNewestFirst(transcripts) {
  return [...transcripts].sort((a, b) => new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0));
}

function dedupeBy(rows, key) {
  return [...new Map(rows.filter((row) => row[key]).map((row) => [row[key], row])).values()];
}

function groupMetrics(rows, getKey) {
  const grouped = {};
  for (const row of rows) {
    const key = getKey(row);
    grouped[key] ||= emptyMetrics();
    addInto(grouped[key], row);
  }

  return grouped;
}

function sumMetrics(rows) {
  const totals = emptyMetrics();
  for (const row of rows) addInto(totals, row);
  return totals;
}

function emptyMetrics() {
  return {
    adSpend: 0,
    leads: 0,
    noAnswer: 0,
    notQualified: 0,
    qualified: 0,
    lender: 0,
    meetingsBooked: 0,
    noShows: 0,
    meetingsAttended: 0,
    closedDeals: 0
  };
}

function addInto(target, row) {
  for (const key of Object.keys(emptyMetrics())) {
    target[key] += Number(row[key] || 0);
  }
}

function addRates(metrics) {
  return {
    ...metrics,
    leadToMeetingRate: safeDivide(metrics.meetingsBooked, metrics.leads),
    meetingToCloseRate: safeDivide(metrics.closedDeals, metrics.meetingsBooked),
    attendanceRate: safeDivide(metrics.meetingsAttended, metrics.meetingsBooked),
    noShowRate: safeDivide(metrics.noShows, metrics.meetingsBooked)
  };
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  const filePath = path.normalize(path.join(publicDir, pathname));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    return res.end(body);
  } catch {
    res.writeHead(404);
    return res.end("Not found");
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function parseSheetDate(value, tab) {
  const raw = cleanText(value);
  if (!raw) return "";

  const parts = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!parts) return "";

  const month = Number(parts[1]);
  const day = Number(parts[2]);
  let year = Number(parts[3]);
  if (year < 100) year += 2000;
  if (year !== tab.year || month !== tab.month) return "";

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseSheetTabs(value) {
  if (value) {
    try {
      const tabs = JSON.parse(value);
      if (Array.isArray(tabs) && tabs.length) return tabs;
    } catch {
      // Use defaults below.
    }
  }

  return [
    { year: 2026, month: 1, gid: "0", name: "January" },
    { year: 2026, month: 2, gid: "608102", name: "February" },
    { year: 2026, month: 3, gid: "1610026683", name: "March" },
    { year: 2026, month: 4, gid: "413460675", name: "April" },
    { year: 2026, month: 5, gid: "2083481286", name: "May" }
  ];
}

function extractList(payload, keys) {
  for (const key of keys) {
    const value = key.split(".").reduce((current, part) => current?.[part], payload);
    if (Array.isArray(value)) return value;
  }

  return Array.isArray(payload) ? payload : [];
}

function chunk(items, size) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function looksLikeCall(message) {
  const type = String(message.type || message.messageType || "").toLowerCase();
  return type.includes("call") || type === "1" || type === "10" || Boolean(message.callDuration || message.meta?.callDuration);
}

function isCallMessage(message) {
  const type = String(message.messageType || message.type || "").toLowerCase();
  return type.includes("call") || Boolean(message.meta?.call);
}

function isUsefulCallMessageForTranscript(message) {
  const duration = getCallDurationSeconds(message);
  const status = getCallStatus(message).toLowerCase();
  if (duration > 0 && duration < minAiCallSeconds) return false;
  return !isBadCallStatus(status);
}

function isUsefulTranscriptForAi(item) {
  const duration = toNumber(item.callDurationSeconds);
  const text = cleanText(item.transcriptText || "");
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  if (duration > 0 && duration < minAiCallSeconds) return false;
  if (text.length < 120 || wordCount < 20) return false;
  return !isBadCallStatus(item.callStatus);
}

function isBadCallStatus(value) {
  const status = cleanText(value).toLowerCase();
  return [
    "no answer",
    "voicemail",
    "missed",
    "failed",
    "busy",
    "cancelled",
    "canceled",
    "not answered"
  ].some((term) => status.includes(term));
}

function getCallStatus(message) {
  return cleanText(message.meta?.call?.status || message.callStatus || message.meta?.callStatus || "");
}

function getCallDurationSeconds(message) {
  return toNumber(message.meta?.call?.duration || message.callDuration || message.meta?.callDuration);
}

function getMessageDirection(message) {
  return cleanText(
    message.direction
      || message.messageDirection
      || message.directionType
      || message.meta?.direction
      || message.meta?.messageDirection
      || message.meta?.call?.direction
      || message.call?.direction
      || ""
  ).toLowerCase();
}

function normalizeStatus(value) {
  const raw = cleanText(value).toLowerCase();
  if (!raw) return "Unknown";
  if (raw.includes("cerrad") || raw.includes("closed")) return "Closed";
  if (raw.includes("no show")) return "No-show";
  if (raw.includes("atendid") || raw.includes("attended")) return "Attended";
  return cleanText(value);
}

function isHeaderish(value) {
  return /reunion|agendada|atendida|closed|fecha|leads/i.test(value);
}

function normalizeName(value) {
  return cleanText(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toNumber(value) {
  return Number(String(value ?? "").replace(/[$,%\s,]/g, "")) || 0;
}

function roundMoney(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function safeDivide(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function weekKey(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const start = new Date(date);
  start.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return start.toISOString().slice(0, 10);
}

function hasSupabase() {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload, null, 2));
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function loadDotEnv(envPath = path.join(__dirname, ".env")) {
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function mask(value) {
  if (!value) return "";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function maskUrl(value) {
  try {
    return new URL(value).host;
  } catch {
    return mask(value);
  }
}

function trimSlash(value) {
  return value.replace(/\/$/, "");
}
