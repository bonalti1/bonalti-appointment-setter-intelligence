const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const percentFmt = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

const companies = [
  {
    key: "all",
    name: "Bonalti",
    initials: "BI",
    logo: "/assets/bonalti.png",
    subtitle: "Appt Setter Intelligence",
    theme: { primary: "#111111", accent: "#111111", soft: "#f1f2f3", highlight: "#111111", monochrome: true }
  },
  {
    key: "south-texas-builders",
    name: "South Texas Builders",
    initials: "ST",
    logo: "/assets/south-texas-builders.png",
    subtitle: "Appointment setter performance",
    theme: { primary: "#142458", accent: "#ff342b", soft: "#eef2fb", highlight: "#142458" }
  },
  {
    key: "cuates",
    name: "Cuates Construction",
    initials: "CC",
    logo: "/assets/cuates-construction.png",
    subtitle: "Appointment setter performance",
    theme: { primary: "#111111", accent: "#c66b22", soft: "#fbf1e8", highlight: "#111111" }
  }
];

const visibleCompanyKeys = new Set(companies.map((company) => company.key).filter((key) => key !== "all"));

const state = {
  data: null,
  selectedCompanyKey: "all",
  transcripts: [],
  activityItems: [],
  reviewMode: "calls",
  adminSpend: 0,
  transcriptFilter: "all",
  transcriptDetailTab: "notes",
  transcriptLanguage: "original",
  notesLanguage: "original",
  spanishTranslations: {},
  spanishNotes: {},
  conversationActivity: {},
  loadingActivityKey: "",
  dailyExecutiveSummaries: {},
  dailySummaryLoadingKey: "",
  latestSavedAt: "",
  latestSavedLabel: "checking",
  selectedTranscriptId: "",
  transcriptSearch: "",
  dashboardDatePreset: "this-month",
  dashboardFrom: "",
  dashboardTo: "",
  transcriptFrom: "",
  transcriptTo: "",
  datePreset: "custom",
  focusedClient: null,
  focusedClientNoMatch: false,
  clientActivityTab: "notes",
  expandedObjection: "",
  objectionPanelOpen: false,
  activityTracker: {
    loading: false,
    key: "",
    label: "Today",
    stats: null,
    recordsProcessed: 0
  }
};

const els = {
  companyNav: document.querySelector("#companyNav"),
  selectedCompany: document.querySelector("#selectedCompany"),
  selectedSubtitle: document.querySelector("#selectedSubtitle"),
  selectedLogo: document.querySelector("#selectedLogo"),
  kpis: document.querySelector("#kpis"),
  funnel: document.querySelector("#funnel"),
  meetingList: document.querySelector("#meetingList"),
  meetingCount: document.querySelector("#meetingCount"),
  sourceRows: document.querySelector("#sourceRows"),
  clientRows: document.querySelector("#clientRows"),
  adminSpend: document.querySelector("#adminSpend"),
  dashboardDateFilter: document.querySelector(".dashboard-date-filter"),
  dashboardCustomDateRange: document.querySelector("#dashboardCustomDateRange"),
  dashboardFrom: document.querySelector("#dashboardFrom"),
  dashboardTo: document.querySelector("#dashboardTo"),
  callInbox: document.querySelector("#callInbox"),
  callDetail: document.querySelector("#callDetail"),
  dailyReport: document.querySelector("#dailyReport"),
  reviewModeTabs: document.querySelector("#reviewModeTabs"),
  transcriptWorkspace: document.querySelector("#transcriptWorkspace"),
  transcriptFrom: document.querySelector("#transcriptFrom"),
  transcriptTo: document.querySelector("#transcriptTo"),
  transcriptTools: document.querySelector("#transcriptTools"),
  customDateRange: document.querySelector("#customDateRange"),
  objectionTrends: document.querySelector("#objectionTrends"),
  objectionDashboard: document.querySelector("#objectionDashboard"),
  toggleObjectionsBtn: document.querySelector("#toggleObjectionsBtn"),
  aiReviewBar: document.querySelector("#aiReviewBar"),
  callAnalysisTracker: document.querySelector("#callAnalysisTracker"),
  lastSavedBtn: document.querySelector("#lastSavedBtn"),
  runAiReviewsBtn: document.querySelector("#runAiReviewsBtn"),
  clientSearch: document.querySelector("#clientSearch"),
  statusStrip: document.querySelector("#statusStrip"),
  toast: document.querySelector("#toast"),
  refreshBtn: document.querySelector("#refreshBtn"),
  syncSheetsBtn: document.querySelector("#syncSheetsBtn"),
  syncGhlBtn: document.querySelector("#syncGhlBtn"),
  syncTranscriptsBtn: document.querySelector("#syncTranscriptsBtn"),
  loadTranscriptsBtn: document.querySelector("#loadTranscriptsBtn")
};

els.refreshBtn.addEventListener("click", () => loadDashboard());
els.lastSavedBtn.addEventListener("click", () => loadLatestSyncStatus());
els.syncSheetsBtn.addEventListener("click", () => runSync("/api/sync/sheets", "Sheets sync finished"));
els.syncGhlBtn.addEventListener("click", () => runSync("/api/sync/ghl", "GHL sync finished"));
els.syncTranscriptsBtn.addEventListener("click", () => syncTranscripts());
els.loadTranscriptsBtn.addEventListener("click", () => loadTranscripts());
els.runAiReviewsBtn.addEventListener("click", () => runAiReviews());
els.reviewModeTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-review-mode]");
  if (!button) return;
  state.reviewMode = button.dataset.reviewMode;
  state.transcriptFilter = "all";
  state.transcriptSearch = "";
  state.transcriptDetailTab = "summary";
  renderTranscriptWorkspace();
  if (state.reviewMode === "report") {
    loadActivityTracker().then(() => renderTranscriptWorkspace());
  }
});
els.clientSearch?.addEventListener("input", () => renderClients(getSelectedView()));
els.adminSpend.addEventListener("input", () => {
  state.adminSpend = Number(els.adminSpend.value || 0);
  saveAdminSpend();
  render();
});
els.toggleObjectionsBtn.addEventListener("click", () => {
  state.objectionPanelOpen = !state.objectionPanelOpen;
  renderObjectionPanelState();
});
els.dashboardDateFilter.addEventListener("click", (event) => {
  const button = event.target.closest("[data-dashboard-date]");
  if (!button) return;
  if (button.dataset.dashboardDate === "clear-custom") {
    applyDashboardDatePreset("custom", { clear: true });
    return;
  }
  applyDashboardDatePreset(button.dataset.dashboardDate);
});
els.dashboardFrom.addEventListener("change", () => {
  state.dashboardFrom = els.dashboardFrom.value;
  state.dashboardDatePreset = "custom";
  renderDashboardDateControls();
  render();
});
els.dashboardTo.addEventListener("change", () => {
  state.dashboardTo = els.dashboardTo.value;
  state.dashboardDatePreset = "custom";
  renderDashboardDateControls();
  render();
});
els.transcriptFrom.addEventListener("change", () => {
  state.transcriptFrom = els.transcriptFrom.value;
  state.datePreset = "custom";
  renderDatePresetControls();
  loadTranscripts();
});
els.transcriptTo.addEventListener("change", () => {
  state.transcriptTo = els.transcriptTo.value;
  state.datePreset = "custom";
  renderDatePresetControls();
  loadTranscripts();
});
els.transcriptTools.addEventListener("click", (event) => {
  const presetButton = event.target.closest("[data-date-preset]");
  if (presetButton) {
    applyDatePreset(presetButton.dataset.datePreset);
    return;
  }

  const button = event.target.closest("[data-transcript-filter]");
  if (!button) return;
  if (button.dataset.transcriptFilter === "clear-dates") {
    applyDatePreset("custom", { clear: true });
    return;
  }
});

renderCompanyNav();
applyDashboardDatePreset("this-month", { renderNow: false });
applyDatePreset("today", { reload: false });
await loadDashboard();
await loadLatestSyncStatus();

async function loadDashboard() {
  setBusy(true);
  try {
    const response = await fetch("/api/dashboard");
    if (!response.ok) throw new Error(await response.text());
    state.data = await response.json();
    render();
    showToast("Dashboard refreshed");
  } catch (error) {
    showToast(`Could not load dashboard: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function loadLatestSyncStatus() {
  try {
    const response = await fetch("/api/sync/latest");
    const payload = await response.json();
    if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || "Could not read latest sync");
    const latest = payload.latest || null;
    const serverSavedAt = latest?.finished_at || latest?.started_at || "";
    if (!state.latestSavedAt || new Date(serverSavedAt || 0) >= new Date(state.latestSavedAt || 0)) {
      setLatestSavedAt(serverSavedAt);
    }
  } catch {
    if (!state.latestSavedAt) state.latestSavedLabel = "unknown";
  }
  renderLastSavedButton();
}

function setLatestSavedAt(value) {
  state.latestSavedAt = value || "";
  state.latestSavedLabel = state.latestSavedAt ? formatDateTime(state.latestSavedAt) : "not saved yet";
  renderLastSavedButton();
}

function renderLastSavedButton() {
  if (!els.lastSavedBtn) return;
  els.lastSavedBtn.textContent = `Last saved: ${state.latestSavedLabel}`;
}

function applyDatePreset(preset, options = {}) {
  state.datePreset = preset;

  if (preset === "custom") {
    if (options.clear) {
      state.transcriptFrom = "";
      state.transcriptTo = "";
    }
  } else {
    const range = dateRangeForPreset(preset);
    state.transcriptFrom = range.from;
    state.transcriptTo = range.to;
  }

  els.transcriptFrom.value = state.transcriptFrom;
  els.transcriptTo.value = state.transcriptTo;
  renderDatePresetControls();

  if (options.reload !== false && state.transcripts.length) {
    loadTranscripts();
  }
}

function applyDashboardDatePreset(preset, options = {}) {
  state.dashboardDatePreset = preset;

  if (preset === "custom") {
    if (options.clear) {
      state.dashboardFrom = "";
      state.dashboardTo = "";
    }
  } else {
    const range = dashboardDateRangeForPreset(preset);
    state.dashboardFrom = range.from;
    state.dashboardTo = range.to;
  }

  els.dashboardFrom.value = state.dashboardFrom;
  els.dashboardTo.value = state.dashboardTo;
  renderDashboardDateControls();

  if (options.renderNow !== false) render();
}

function renderDashboardDateControls() {
  for (const button of els.dashboardDateFilter.querySelectorAll("[data-dashboard-date]")) {
    button.classList.toggle("active", button.dataset.dashboardDate === state.dashboardDatePreset);
  }

  els.dashboardCustomDateRange.hidden = state.dashboardDatePreset !== "custom";
}

function dashboardDateRangeForPreset(preset) {
  const today = new Date();
  if (preset === "this-month") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: dateInputValue(first), to: dateInputValue(today) };
  }

  if (preset === "last-month") {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: dateInputValue(first), to: dateInputValue(last) };
  }

  if (preset === "this-year") {
    const first = new Date(today.getFullYear(), 0, 1);
    return { from: dateInputValue(first), to: dateInputValue(today) };
  }

  return { from: dateInputValue(today), to: dateInputValue(today) };
}

function renderDatePresetControls() {
  for (const button of els.transcriptTools.querySelectorAll("[data-date-preset]")) {
    button.classList.toggle("active", button.dataset.datePreset === state.datePreset);
  }

  els.customDateRange.hidden = state.datePreset !== "custom";
}

function dateRangeForPreset(preset) {
  const today = new Date();
  if (preset === "yesterday") {
    const date = addDays(today, -1);
    return { from: dateInputValue(date), to: dateInputValue(date) };
  }

  if (preset === "last-month") {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: dateInputValue(first), to: dateInputValue(last) };
  }

  return { from: dateInputValue(today), to: dateInputValue(today) };
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function runSync(endpoint, successMessage) {
  setBusy(true);
  try {
    const response = await fetch(endpoint, { method: "POST" });
    const payload = await response.json();
    if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || "Sync failed");
    showToast(`${successMessage}: ${payload.recordsProcessed || 0} records`);
    await loadDashboard();
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

function render() {
  if (!state.data) return;
  const view = getSelectedView();
  const company = getSelectedCompany();

  applyTheme(company.theme);
  els.selectedCompany.textContent = company.name;
  els.selectedSubtitle.textContent = company.subtitle;
  els.selectedLogo.innerHTML = company.logo
    ? `<img alt="${company.name} logo" src="${company.logo}">`
    : company.initials;

  renderCompanyNav();
  renderStatus(state.data.status);
  loadAdminSpend();
  renderKpis(view.totals);
  renderCallAnalysisTracker();
  renderMeetings(view.clients);
  loadActivityTracker();
}

function getSelectedView() {
  if (!state.data) return emptyView();

  const selectedKey = state.selectedCompanyKey;
  const sourceDailyRows = selectedKey === "all"
    ? state.data.dailyRows.filter((row) => visibleCompanyKeys.has(row.sourceKey))
    : state.data.dailyRows.filter((row) => row.sourceKey === selectedKey);
  const sourceClients = selectedKey === "all"
    ? state.data.clients.filter((client) => visibleCompanyKeys.has(client.sourceKey))
    : state.data.clients.filter((client) => client.sourceKey === selectedKey);
  const dailyRows = filterRowsByDashboardDate(sourceDailyRows, "date");
  const clients = filterRowsByDashboardDate(sourceClients, "date");

  const byMonth = groupMetrics(dailyRows, (row) => row.monthName);
  const byWeek = groupMetrics(dailyRows, (row) => weekKey(row.date));
  const bySource = mergeClosedClientCounts(
    groupMetrics(dailyRows, (row) => row.sourceName),
    groupClosedClients(clients, (client) => client.sourceName)
  );
  const bySetter = groupClientsBySetter(clients);
  const totals = totalsWithClientClosedDeals(dailyRows, clients);

  return {
    dailyRows,
    clients,
    totals,
    byMonth: Object.entries(byMonth).map(([label, metrics]) => ({ label, ...addRates(metrics) })),
    byWeek: Object.entries(byWeek).map(([label, metrics]) => ({ label, ...addRates(metrics) })),
    bySource: Object.entries(bySource).map(([label, metrics]) => ({ label, ...addRates(metrics) })),
    bySetter
  };
}

function totalsWithClientClosedDeals(dailyRows, clients) {
  const totals = sumMetrics(dailyRows);
  totals.closedDeals = countClosedClients(clients);
  return addRates(totals);
}

function mergeClosedClientCounts(metricGroups, closedGroups) {
  const merged = { ...metricGroups };
  for (const [label, closedDeals] of Object.entries(closedGroups)) {
    merged[label] ||= emptyMetrics();
    merged[label].closedDeals = closedDeals;
  }
  return merged;
}

function groupClosedClients(clients, getKey) {
  const groups = {};
  for (const client of clients) {
    if (client.status !== "Closed") continue;
    const key = getKey(client) || "Unknown";
    groups[key] = (groups[key] || 0) + 1;
  }
  return groups;
}

function countClosedClients(clients) {
  return clients.filter((client) => client.status === "Closed").length;
}

function adminSpendKey() {
  return `adminSpend:${state.selectedCompanyKey}:${state.dashboardFrom || "start"}:${state.dashboardTo || "today"}`;
}

function loadAdminSpend() {
  const value = Number(localStorage.getItem(adminSpendKey()) || 0);
  state.adminSpend = value;
  if (els.adminSpend) els.adminSpend.value = value ? String(value) : "";
}

function saveAdminSpend() {
  localStorage.setItem(adminSpendKey(), String(state.adminSpend || 0));
}

function filterRowsByDashboardDate(rows, key) {
  if (!state.dashboardFrom && !state.dashboardTo) return rows;
  return rows.filter((row) => {
    const value = row[key] || "";
    if (!value) return false;
    if (state.dashboardFrom && value < state.dashboardFrom) return false;
    if (state.dashboardTo && value > state.dashboardTo) return false;
    return true;
  });
}

function emptyView() {
  return {
    dailyRows: [],
    clients: [],
    totals: addRates(emptyMetrics()),
    byMonth: [],
    byWeek: [],
    bySource: [],
    bySetter: []
  };
}

function renderCompanyNav() {
  els.companyNav.innerHTML = companies.map((company) => `
    <button class="${company.key === state.selectedCompanyKey ? "active" : ""}" data-company-key="${company.key}">
      <span class="nav-logo">${company.logo ? `<img alt="" src="${company.logo}">` : company.initials}</span>
      ${company.name}
    </button>
  `).join("");

  for (const button of els.companyNav.querySelectorAll("[data-company-key]")) {
    button.addEventListener("click", () => {
      state.selectedCompanyKey = button.dataset.companyKey;
      resetTranscriptPanel();
      state.activityTracker.stats = null;
      state.activityTracker.recordsProcessed = 0;
      render();
    });
  }
}

async function loadTranscripts(options = {}) {
  const sourceKey = options.sourceKey || state.selectedCompanyKey;
  setBusy(true);
  els.loadTranscriptsBtn.disabled = true;
  els.callInbox.innerHTML = `<p class="empty-state">Loading saved phone calls from Supabase...</p>`;
  els.callDetail.innerHTML = `<p class="empty-state">Preparing call review...</p>`;

  try {
    const params = new URLSearchParams({
      sourceKey,
      limit: options.limit || "120"
    });
    if (state.transcriptFrom) params.set("from", state.transcriptFrom);
    if (state.transcriptTo) params.set("to", state.transcriptTo);
    const response = await fetch(`/api/transcripts/saved?${params}`);
    const payload = await response.json();
    if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || "Could not load transcripts");
    state.transcripts = (payload.transcripts || [])
      .map(enrichTranscript)
      .sort((a, b) => new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0));
    state.activityItems = transcriptActivityRows(state.transcripts);
    state.transcriptFilter = "all";
    state.transcriptDetailTab = "summary";
    state.selectedTranscriptId = options.selectMessageId || state.transcripts[0]?.messageId || "";
    state.transcriptSearch = "";
    renderTranscriptIntelligence(state.transcripts);
    if (options.focusClient) selectTranscriptForClient(options.focusClient);
    renderTranscriptWorkspace();
    loadTrackerCounts(sourceKey, state.transcripts, options.limit || "80");
    showToast(payload.message || "Saved reviews loaded");
  } catch (error) {
    els.callInbox.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    els.callDetail.innerHTML = `<p class="empty-state">Select a conversation to review the details.</p>`;
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

function transcriptActivityRows(transcripts) {
  return transcripts.map((item) => ({
    ...item,
    activityId: item.messageId,
    kind: "call",
    typeLabel: "Call"
  }));
}

async function loadTrackerCounts(sourceKey, transcripts, limit = "80") {
  const rows = await loadDailyActivityItems(sourceKey, transcripts, limit);
  state.activityItems = rows.length ? rows : transcriptActivityRows(transcripts);
  mergeCallDirectionsFromActivity();
  renderCallAnalysisTracker();
  if (state.reviewMode === "calls" && state.transcripts.length) renderTranscriptWorkspace();
  if (state.reviewMode === "report") renderTranscriptWorkspace();
}

function mergeCallDirectionsFromActivity() {
  const directionByMessage = new Map(
    state.activityItems
      .filter((item) => item.kind === "call" && item.messageId && item.direction)
      .map((item) => [item.messageId, item.direction])
  );
  if (!directionByMessage.size) return;

  state.transcripts = state.transcripts.map((item) => ({
    ...item,
    direction: item.direction || directionByMessage.get(item.messageId) || ""
  }));
}

async function loadDailyActivityItems(sourceKey, transcripts, limit) {
  try {
    const params = new URLSearchParams({ sourceKey, limit: String(limit || "150") });
    if (state.transcriptFrom) params.set("from", state.transcriptFrom);
    if (state.transcriptTo) params.set("to", state.transcriptTo);
    const response = await fetch(`/api/daily-activity?${params}`);
    const payload = await response.json();
    if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || "Daily activity failed");
    const transcriptMap = new Map(transcripts.map((item) => [item.messageId, item]));
    return (payload.activity || []).map((item) => normalizeActivityItem(item, transcriptMap));
  } catch (error) {
    showToast(`GHL activity list not fully loaded: ${error.message}`);
    return transcripts.map((item) => ({
      ...item,
      activityId: item.messageId,
      kind: "call",
      typeLabel: "Call"
    }));
  }
}

async function openClientConversation(client) {
  const previousKey = state.selectedCompanyKey;
  state.transcriptFrom = "";
  state.transcriptTo = "";
  state.focusedClient = null;
  state.focusedClientNoMatch = false;
  els.transcriptFrom.value = "";
  els.transcriptTo.value = "";

  if (client.sourceKey && client.sourceKey !== state.selectedCompanyKey) {
    state.selectedCompanyKey = client.sourceKey;
    resetTranscriptPanel();
    render();
  }

  state.focusedClient = client;
  renderClients(getSelectedView());

  document.querySelector("#transcriptWorkspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
  await loadTranscripts({ sourceKey: client.sourceKey || previousKey, limit: "500", focusClient: client });
}

async function openClientNotes(client) {
  state.focusedClient = client;
  state.focusedClientNoMatch = false;
  state.clientActivityTab = "notes";

  if (client.sourceKey && client.sourceKey !== state.selectedCompanyKey) {
    state.selectedCompanyKey = client.sourceKey;
    resetTranscriptPanel();
    render();
    state.focusedClient = client;
    renderClients(getSelectedView());
  }

  els.transcriptTools.hidden = true;
  els.objectionDashboard.hidden = true;
  els.aiReviewBar.hidden = true;
  state.activityTracker.stats = null;
  state.activityTracker.recordsProcessed = 0;
  els.callInbox.innerHTML = renderClientNotesSidebar(client);
  els.callDetail.innerHTML = `<p class="empty-state">Loading GHL activity for ${escapeHtml(client.clientName)}...</p>`;
  document.querySelector("#transcriptWorkspace")?.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const params = new URLSearchParams({
      sourceKey: client.sourceKey,
      clientName: client.clientName
    });
    const response = await fetch(`/api/client-activity?${params}`);
    const payload = await response.json();
    if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || "Could not load GHL activity");
    renderClientNotes(client, payload);
    showToast(payload.message || "GHL activity loaded");
  } catch (error) {
    els.callDetail.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    showToast(error.message);
  }
}

function renderClientNotesSidebar(client) {
  return `
    <div class="client-note-card">
      <span>Client</span>
      <strong>${escapeHtml(client.clientName)}</strong>
      <small>${escapeHtml(client.sourceName)} · ${escapeHtml(client.status)} · ${escapeHtml(client.date || "Unknown date")}</small>
      <button class="back-link" id="backToClientBtn">Back to client list</button>
    </div>
  `;
}

function renderClientNotes(client, payload) {
  const notes = payload.notes || [];
  const messages = payload.messages || [];
  const activeTab = state.clientActivityTab || "notes";
  els.callInbox.innerHTML = renderClientNotesSidebar(client);
  els.callDetail.innerHTML = `
    <article class="transcript-card notes-card">
      <div class="transcript-card-head">
        <div>
          <span class="transcript-meta">GHL Activity · ${escapeHtml(client.sourceName)}</span>
          <h3>${escapeHtml(client.clientName)}</h3>
          <div class="detail-tags">
            <span>${escapeHtml(client.status)}</span>
            <span>${escapeHtml(client.date || "Unknown date")}</span>
            <span>${fmt(notes.length)} note${notes.length === 1 ? "" : "s"}</span>
            <span>${fmt(messages.length)} message${messages.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>
      <div class="client-activity-tabs">
        <button class="${activeTab === "notes" ? "active" : ""}" data-client-activity-tab="notes">Notes</button>
        <button class="${activeTab === "messages" ? "active" : ""}" data-client-activity-tab="messages">Messages</button>
      </div>
      ${activeTab === "notes" ? renderGhlNotes(notes) : renderGhlMessages(messages)}
    </article>
  `;

  for (const button of els.callDetail.querySelectorAll("[data-client-activity-tab]")) {
    button.addEventListener("click", () => {
      state.clientActivityTab = button.dataset.clientActivityTab;
      renderClientNotes(client, payload);
    });
  }

  const back = document.querySelector("#backToClientBtn");
  back?.addEventListener("click", () => {
    const row = document.querySelector(`[data-client-id="${cssEscape(client.id || "")}"]`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function renderGhlNotes(notes) {
  return notes.length ? `
        <div class="ghl-notes-list">
          ${notes.map((note) => `
            <section class="ghl-note ${note.pinned ? "pinned" : ""}">
              <div>
                <strong>${escapeHtml(note.title || "GHL Note")}</strong>
                <span>${escapeHtml(note.dateAdded ? formatDateTime(note.dateAdded) : "No note date")}</span>
              </div>
              <p>${escapeHtml(note.body)}</p>
            </section>
          `).join("")}
        </div>
      ` : `
        <p class="empty-state">No GHL notes found for this client yet.</p>
  `;
}

function renderGhlMessages(messages) {
  return messages.length ? `
    <div class="ghl-messages-list">
      ${messages.map((message) => `
        <section class="ghl-message">
          <div class="ghl-message-head">
            <div>
              <strong>${escapeHtml(titleCase(message.typeLabel || "Message"))}</strong>
              <span>${escapeHtml(message.dateAdded ? formatDateTime(message.dateAdded) : "No message date")}</span>
            </div>
            <div class="ghl-message-badges">
              ${message.direction ? `<span>${escapeHtml(titleCase(message.direction))}</span>` : ""}
              ${message.status ? `<span>${escapeHtml(titleCase(message.status))}</span>` : ""}
            </div>
          </div>
          <p>${escapeHtml(message.body || "Message activity")}</p>
        </section>
      `).join("")}
    </div>
  ` : `
    <p class="empty-state">No GHL messages found for this client yet.</p>
  `;
}

function selectTranscriptForClient(client) {
  const match = findClientTranscript(client);
  if (match) {
    state.selectedTranscriptId = match.messageId;
    state.transcriptDetailTab = "notes";
    state.focusedClientNoMatch = false;
    return;
  }

  state.selectedTranscriptId = "";
  state.focusedClientNoMatch = true;
}

function findClientTranscript(client) {
  const target = normalizePersonName(client.clientName);
  if (!target) return null;

  const sameSource = state.transcripts.filter((item) => !client.sourceKey || item.sourceKey === client.sourceKey);
  const exact = sameSource.find((item) => normalizePersonName(item.clientName) === target);
  if (exact) return exact;

  return sameSource.find((item) => {
    const name = normalizePersonName(item.clientName);
    return name && (name.includes(target) || target.includes(name));
  }) || null;
}

async function syncTranscripts() {
  const sourceKey = state.selectedCompanyKey;
  setBusy(true);
  els.callInbox.innerHTML = `<p class="empty-state">Loading saved phone calls...</p>`;
  els.callDetail.innerHTML = `<p class="empty-state">Messages are counted in the tracker. The review list stays focused on calls only.</p>`;

  try {
    const params = new URLSearchParams({ sourceKey, limit: "120" });
    if (state.transcriptFrom) params.set("from", state.transcriptFrom);
    if (state.transcriptTo) params.set("to", state.transcriptTo);

    const savedResponse = await fetch(`/api/transcripts/saved?${params}`);
    const savedPayload = await savedResponse.json();
    if (!savedResponse.ok || savedPayload.ok === false) throw new Error(savedPayload.message || savedPayload.error || "Saved transcript load failed");

    state.transcripts = (savedPayload.transcripts || [])
      .map(enrichTranscript)
      .sort((a, b) => new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0));
    state.activityItems = transcriptActivityRows(state.transcripts);
    state.transcriptFilter = "all";
    state.transcriptDetailTab = "summary";
    state.selectedTranscriptId = state.transcripts[0]?.messageId || "";
    state.transcriptSearch = "";
    renderTranscriptIntelligence(state.transcripts);
    renderTranscriptWorkspace();
    setLatestSavedAt(new Date().toISOString());
    loadTrackerCounts(sourceKey, state.transcripts, "80");
    await markLatestLeadsSaved(state.transcripts.length);
    await loadLatestSyncStatus();
    state.activityTracker.key = "";
    state.activityTracker.stats = null;
    loadActivityTracker();
    showToast("Latest leads loaded");
  } catch (error) {
    els.callInbox.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    els.callDetail.innerHTML = `<p class="empty-state">Latest leads did not finish loading.</p>`;
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

async function markLatestLeadsSaved(recordsProcessed) {
  const response = await fetch("/api/sync/mark", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      syncType: `manual-latest-leads:${state.selectedCompanyKey}`,
      recordsProcessed
    })
  });
  if (!response.ok) throw new Error("Latest leads loaded, but the saved timestamp did not update.");
}

async function runAiReviews() {
  const sourceKey = state.selectedCompanyKey;
  setBusy(true);
  els.runAiReviewsBtn.disabled = true;
  els.callDetail.innerHTML = `<p class="empty-state">Analyzing saved connected phone calls only. Short, missed, and already-reviewed calls are skipped.</p>`;

  try {
    const params = new URLSearchParams({
      sourceKey,
      syncLimit: "0",
      analyzeLimit: "6"
    });
    if (state.transcriptFrom) params.set("from", state.transcriptFrom);
    if (state.transcriptTo) params.set("to", state.transcriptTo);
    const response = await fetch(`/api/ai/analyze-calls?${params}`, { method: "POST" });
    const payload = await readApiResponse(response);
    if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || "AI call analysis failed");
    showToast(payload.message || "AI call analysis finished");
    await loadTranscripts();
  } catch (error) {
    els.callDetail.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    showToast(error.message);
  } finally {
    els.runAiReviewsBtn.disabled = false;
    setBusy(false);
  }
}

function renderTranscriptWorkspace() {
  const baseItems = transcriptActivityRows(state.transcripts);
  const visible = filterActivityItems(baseItems);

  renderReviewModeState(visible);

  if (state.reviewMode === "report") {
    renderDailyReport(visible);
    return;
  }

  if (!visible.length) {
    els.callInbox.innerHTML = `<p class="empty-state">No saved calls match the current filters. Clear filters, change the date, or sync a larger batch.</p>`;
    els.callDetail.innerHTML = `<p class="empty-state">Select another filter, search term, or date range.</p>`;
    return;
  }

  if (!state.focusedClientNoMatch && !visible.some((item) => item.activityId === state.selectedTranscriptId)) {
    state.selectedTranscriptId = visible[0].activityId;
  }

  els.callInbox.innerHTML = `
    <div class="inbox-summary">
      <div>
        <strong>${fmt(visible.length)} saved calls</strong>
        <span>Phone calls only</span>
      </div>
      <input id="reviewSearch" type="search" placeholder="Search calls" value="${escapeHtml(state.transcriptSearch)}">
      <div class="review-filters">
        ${renderModeFilters()}
      </div>
    </div>
    ${visible.map((item) => `
    <button class="call-row ${item.activityId === state.selectedTranscriptId ? "active" : ""} ${item.kind === "call" && item.review.qualityScore >= 82 ? "high-score" : item.review?.qualityScore < 65 ? "needs-work" : ""}" data-activity-id="${escapeHtml(item.activityId)}">
      <div class="call-row-top">
        <strong>${escapeHtml(item.clientName)}</strong>
        <span class="review-status ai">${escapeHtml(callDirectionLabel(item))}</span>
      </div>
      <div class="call-row-meta">
        <span>${escapeHtml(item.sourceName)}</span>
        <span>${formatDateTime(item.dateAdded)}</span>
        <span>${item.callDurationSeconds ? `${item.callDurationSeconds}s` : callDirectionLabel(item)}</span>
      </div>
      <small>${escapeHtml(activityPreview(item))}</small>
      <div class="call-tags">
        ${item.review?.needsFollowUp ? `<span class="call-tag">Follow-up</span>` : ""}
        ${(item.review?.objections || []).slice(0, 2).map((objection) => `<span class="call-tag">${escapeHtml(objection)}</span>`).join("")}
      </div>
    </button>
  `).join("")}`;

  els.callInbox.querySelector("#reviewSearch")?.addEventListener("input", (event) => {
    state.transcriptSearch = event.target.value;
    renderTranscriptWorkspace();
  });

  for (const button of els.callInbox.querySelectorAll("[data-review-filter]")) {
    button.addEventListener("click", () => {
      state.transcriptFilter = button.dataset.reviewFilter;
      renderTranscriptWorkspace();
    });
  }

  for (const button of els.callInbox.querySelectorAll("[data-activity-id]")) {
    button.addEventListener("click", () => {
      state.selectedTranscriptId = button.dataset.activityId;
      state.focusedClientNoMatch = false;
      state.transcriptLanguage = "original";
      state.transcriptDetailTab = "summary";
      renderTranscriptWorkspace();
    });
  }

  if (state.focusedClientNoMatch && state.focusedClient) {
    renderNoClientTranscriptMatch(state.focusedClient);
    return;
  }

  renderSelectedActivity(visible.find((item) => item.activityId === state.selectedTranscriptId) || visible[0]);
}

function reviewFilterButton(key, label) {
  return `<button class="${state.transcriptFilter === key ? "active" : ""}" data-review-filter="${key}">${label}</button>`;
}

function renderModeFilters() {
  if (state.reviewMode === "calls") {
    return [
      reviewFilterButton("all", "All Calls"),
      reviewFilterButton("follow-up", "Follow-up"),
      reviewFilterButton("ai", "AI notes"),
      reviewFilterButton("needs-ai", "Needs AI")
    ].join("");
  }

  return [
    reviewFilterButton("all", "All Calls"),
    reviewFilterButton("follow-up", "Follow-up")
  ].join("");
}

function renderReviewModeState(visible) {
  for (const button of els.reviewModeTabs.querySelectorAll("[data-review-mode]")) {
    button.classList.toggle("active", button.dataset.reviewMode === state.reviewMode);
  }

  const isReport = state.reviewMode === "report";
  const isCalls = state.reviewMode === "calls";
  els.transcriptWorkspace.hidden = isReport;
  els.dailyReport.hidden = !isReport;
  els.objectionDashboard.hidden = !isCalls;
  els.aiReviewBar.hidden = !isCalls;

  if (isReport) {
    els.callInbox.innerHTML = "";
    els.callDetail.innerHTML = "";
  } else if (els.dailyReport) {
    els.dailyReport.hidden = true;
  }

  renderCallAnalysisTracker();
}

function renderCallAnalysisTracker() {
  if (!els.callAnalysisTracker) return;
  const stats = state.activityTracker.stats || buildActivityDirectionStats([]);
  const label = state.activityTracker.loading
    ? "Loading today"
    : state.activityTracker.label || "Today";
  els.callAnalysisTracker.innerHTML = `
    <article><span>Inbound Messages</span><strong>${fmt(stats.inboundMessages)}</strong></article>
    <article><span>Inbound Calls</span><strong>${fmt(stats.inboundCalls)}</strong></article>
    <article><span>Outbound Messages</span><strong>${fmt(stats.outboundMessages)}</strong></article>
    <article><span>Outbound Calls Made</span><strong>${fmt(stats.outboundCalls)}</strong></article>
    <article class="wide"><span>${escapeHtml(label)} · Last saved</span><strong>${escapeHtml(state.latestSavedLabel)}</strong></article>
  `;
}

async function loadActivityTracker(options = {}) {
  if (!els.callAnalysisTracker || state.activityTracker.loading) return;

  const today = dateInputValue(new Date());
  const key = `${state.selectedCompanyKey}:${today}`;
  if (!options.force && state.activityTracker.key === key && state.activityTracker.stats) return;

  state.activityTracker.loading = true;
  state.activityTracker.key = key;
  state.activityTracker.label = "Today";
  renderCallAnalysisTracker();

  try {
    const params = new URLSearchParams({
      sourceKey: state.selectedCompanyKey,
      from: today,
      to: today,
      limit: "500"
    });
    const response = await fetch(`/api/activity/stats?${params}`);
    const payload = await response.json();
    if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || "Activity tracker failed");
    state.activityTracker.stats = payload.stats || buildActivityDirectionStats([]);
    state.activityTracker.recordsProcessed = payload.recordsProcessed || 0;
  } catch (error) {
    showToast(`Activity tracker not fully loaded: ${error.message}`);
    state.activityTracker.stats = buildActivityDirectionStats([]);
  } finally {
    state.activityTracker.loading = false;
    renderCallAnalysisTracker();
  }
}

function filterItemsByTranscriptDate(items) {
  return items.filter((item) => {
    const value = localDateKey(item.dateAdded);
    if (!value) return false;
    if (state.transcriptFrom && value < state.transcriptFrom) return false;
    if (state.transcriptTo && value > state.transcriptTo) return false;
    return true;
  });
}

function buildActivityDirectionStats(items) {
  const stats = { inboundMessages: 0, inboundCalls: 0, outboundMessages: 0, outboundCalls: 0 };
  for (const item of items) {
    const direction = String(item.direction || "").toLowerCase();
    const inbound = direction.includes("inbound");
    const outbound = direction.includes("outbound");
    if (item.kind === "call") {
      if (inbound) stats.inboundCalls += 1;
      else if (outbound) stats.outboundCalls += 1;
    } else {
      if (inbound) stats.inboundMessages += 1;
      else if (outbound) stats.outboundMessages += 1;
    }
  }
  return stats;
}

function callDirectionLabel(item) {
  const direction = String(item.direction || "").toLowerCase();
  if (direction.includes("inbound")) return "Inbound Call";
  if (direction.includes("outbound")) return "Outbound Call";
  return "Unknown Direction Call";
}

function renderNoClientTranscriptMatch(client) {
  els.callDetail.innerHTML = `
    <div class="empty-state client-no-match">
      <strong>No saved transcript found for ${escapeHtml(client.clientName)}.</strong>
      <span>${escapeHtml(client.status)} · ${escapeHtml(client.sourceName)} · ${escapeHtml(client.date || "Unknown date")}</span>
      <p>This client is in the sheet, but there is not a matching saved GHL transcript yet. It may be a no-call record, a different GHL contact name, or a transcript that has not synced yet.</p>
      <button class="back-link" id="backToClientBtn">Back to client list</button>
    </div>
  `;

  els.callDetail.querySelector("#backToClientBtn")?.addEventListener("click", () => {
    const row = document.querySelector(`[data-client-id="${cssEscape(client.id || "")}"]`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function renderSelectedActivity(item) {
  if (!item) {
    els.callDetail.innerHTML = `<p class="empty-state">Select a call to review the details.</p>`;
    return;
  }

  renderSelectedTranscript(item);
}

function renderSelectedTranscript(item) {
  if (!item) {
    els.callDetail.innerHTML = `<p class="empty-state">Select a conversation to review the details.</p>`;
    return;
  }

  const activeTab = state.transcriptDetailTab || "summary";
  const tabBody = activeTab === "summary"
    ? renderSummaryTab(item)
    : activeTab === "transcript"
      ? renderTranscriptTab(item)
      : activeTab === "follow-up"
        ? renderFollowUpTab(item)
        : renderNotesTab(item);

  els.callDetail.innerHTML = `
    <article class="transcript-card ${item.review.qualityScore >= 82 ? "high-score" : item.review.qualityScore < 65 ? "needs-work" : ""}">
      ${state.focusedClient ? `<button class="back-link" id="backToClientBtn">Back to client list</button>` : ""}
      <div class="transcript-card-head">
        <div>
          <span class="transcript-meta">${escapeHtml(item.sourceName)} · ${formatDateTime(item.dateAdded)}</span>
          <h3>${escapeHtml(item.clientName)}</h3>
          <div class="detail-tags">
            <span>${escapeHtml(callDirectionLabel(item))}</span>
            ${item.callDurationSeconds ? `<span>${item.callDurationSeconds}s</span>` : ""}
            <span>${escapeHtml(item.callStatus || "Saved transcript")}</span>
            <span>${item.review.hasAi ? "AI reviewed" : "Needs AI review"}</span>
          </div>
        </div>
        <span class="pill ${item.review.hasAi ? "dark" : item.review.qualityScore >= 82 ? "green" : item.review.qualityScore < 65 ? "orange" : ""}">${item.review.hasAi ? "AI notes" : `${item.review.qualityScore}/100`}</span>
      </div>
      <div class="detail-tabs">
        <button class="${activeTab === "summary" ? "active" : ""}" data-detail-tab="summary">Summary</button>
        <button class="${activeTab === "transcript" ? "active" : ""}" data-detail-tab="transcript">Transcript / Spanish</button>
        <button class="${activeTab === "notes" ? "active" : ""}" data-detail-tab="notes">AI Notes</button>
        <button class="${activeTab === "follow-up" ? "active" : ""}" data-detail-tab="follow-up">Follow-Up</button>
      </div>
      ${tabBody}
    </article>
  `;

  els.callDetail.querySelector("#backToClientBtn")?.addEventListener("click", () => {
    const row = document.querySelector(`[data-client-id="${cssEscape(state.focusedClient?.id || "")}"]`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  for (const button of els.callDetail.querySelectorAll("[data-detail-tab]")) {
    button.addEventListener("click", () => {
      state.transcriptDetailTab = button.dataset.detailTab;
      renderSelectedTranscript(item);
    });
  }

  for (const button of els.callDetail.querySelectorAll("[data-transcript-language]")) {
    button.addEventListener("click", () => {
      state.transcriptLanguage = button.dataset.transcriptLanguage;
      renderSelectedTranscript(item);
    });
  }

  for (const button of els.callDetail.querySelectorAll("[data-notes-language]")) {
    button.addEventListener("click", () => {
      state.notesLanguage = button.dataset.notesLanguage;
      renderSelectedTranscript(item);
    });
  }

  els.callDetail.querySelector("#translateSpanishBtn")?.addEventListener("click", () => translateSelectedTranscript(item));
  els.callDetail.querySelector("#translateNotesSpanishBtn")?.addEventListener("click", () => translateSelectedNotes(item));

}

function renderSummaryTab(item) {
  const review = item.review;
  const intelligence = review.intelligence || {};
  return `
    <section class="conversation-summary">
      <div class="summary-main">
        <span>What happened</span>
        <strong>${escapeHtml(review.hasAi ? (intelligence.whatHappened || review.longSummary) : review.summary)}</strong>
      </div>
      <div class="summary-grid">
        <div>
          <span>Main objection</span>
          <strong>${escapeHtml(review.objections[0] || "None found")}</strong>
        </div>
        <div>
          <span>Follow-up</span>
          <strong>${escapeHtml(intelligence.followUpNeeded || (review.needsFollowUp ? "Needs action" : "No urgent action"))}</strong>
        </div>
      </div>
      <div class="summary-next-action">
        <span>Recommended next action</span>
        <strong>${escapeHtml(review.nextAction)}</strong>
      </div>
    </section>
  `;
}

function renderNotesTab(item) {
  const isSpanish = state.notesLanguage === "spanish";
  const spanishNotes = state.spanishNotes[item.messageId] || null;
  const noteText = getReviewText(item.review, isSpanish, spanishNotes);
  return `
    <div class="notes-language-bar">
      <span>AI Notes Language</span>
      <div class="transcript-language-toggle">
        <button class="${!isSpanish ? "active" : ""}" data-notes-language="original">AI Original</button>
        <button class="${isSpanish ? "active" : ""}" data-notes-language="spanish">AI Spanish</button>
      </div>
    </div>
    ${isSpanish && !spanishNotes ? `
      <div class="translation-empty notes-translation-empty">
        <p>These AI notes have not been translated to Spanish yet.</p>
        <button class="icon-button primary" id="translateNotesSpanishBtn">Translate AI Notes to Spanish</button>
      </div>
    ` : ""}
    <div class="call-hero-note">
      <span>${item.review.hasAi ? noteText.guidanceLabel : noteText.quickGuidanceLabel}</span>
      <strong>${escapeHtml(noteText.summary)}</strong>
    </div>
    <div class="review-grid notes-grid">
      <div class="review-chip wide">
        <span>${noteText.whatHappenedLabel}</span>
        <strong>${escapeHtml(item.review.hasAi ? noteText.longSummary : noteText.noAiSummary)}</strong>
      </div>
      <div class="review-chip">
        <span>${noteText.objectionsLabel}</span>
        <strong>${escapeHtml(noteText.objections)}</strong>
      </div>
      <div class="review-chip">
        <span>${noteText.followUpLabel}</span>
        <strong>${escapeHtml(noteText.followUpNeeded)}</strong>
      </div>
      <div class="review-chip action">
        <span>${noteText.nextActionLabel}</span>
        <strong>${escapeHtml(noteText.nextAction)}</strong>
      </div>
    </div>
  `;
}

function renderConversationActivityTab(item, type) {
  const activity = getCachedActivity(item);
  const label = type === "messages" ? "messages" : "notes";
  const rows = activity?.[label] || [];

  if (!activity) {
    return `<p class="empty-state">Loading GHL ${label} for ${escapeHtml(item.clientName)}...</p>`;
  }

  if (!rows.length) {
    return `<p class="empty-state">No GHL ${label} found for this client yet.</p>`;
  }

  return type === "messages" ? renderGhlMessages(rows) : renderGhlNotes(rows);
}

async function loadActivityForTranscript(item) {
  const key = activityCacheKey(item);
  if (!key || state.conversationActivity[key] || state.loadingActivityKey === key) return;
  state.loadingActivityKey = key;

  try {
    const params = new URLSearchParams({
      sourceKey: item.sourceKey,
      clientName: item.clientName
    });
    const response = await fetch(`/api/client-activity?${params}`);
    const payload = await response.json();
    if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || "Could not load GHL activity");
    state.conversationActivity[key] = payload;
  } catch (error) {
    state.conversationActivity[key] = { ok: false, notes: [], messages: [], message: error.message };
    showToast(error.message);
  } finally {
    state.loadingActivityKey = "";
    if (state.selectedTranscriptId === item.messageId) renderSelectedTranscript(item);
  }
}

function getCachedActivity(item) {
  return state.conversationActivity[activityCacheKey(item)] || null;
}

function activityCacheKey(item) {
  return `${item.sourceKey || ""}:${normalizePersonName(item.clientName || "")}`;
}

function getReviewText(review, spanish, spanishNotes = null) {
  if (!spanish) {
    return {
      guidanceLabel: "AI guidance",
      quickGuidanceLabel: "Quick guidance",
      whatHappenedLabel: "What Happened",
      objectionsLabel: "Main Objections",
      followUpLabel: "Follow-Up Needed",
      nextActionLabel: "Recommended Next Action",
      summary: review.summary,
      longSummary: review.longSummary,
      noAiSummary: "This call has not been summarized by AI yet. Click Analyze New Calls to generate a real summary from the saved transcript.",
      objections: review.objections.join(", ") || "None found",
      followUpNeeded: review.intelligence?.followUpNeeded || (review.needsFollowUp ? "Needs action" : "No urgent action"),
      nextAction: review.nextAction
    };
  }

  if (spanishNotes) {
    return {
      guidanceLabel: "Guia de IA",
      quickGuidanceLabel: "Guia rapida",
      whatHappenedLabel: "Que paso",
      objectionsLabel: "Objeciones principales",
      followUpLabel: "Seguimiento necesario",
      nextActionLabel: "Siguiente accion recomendada",
      summary: spanishNotes.summary,
      longSummary: spanishNotes.longSummary,
      noAiSummary: "Esta llamada todavia no tiene un resumen de IA. Haz clic en Analyze New Calls para generar un resumen real desde la transcripcion guardada.",
      objections: spanishNotes.objections,
      followUpNeeded: spanishNotes.followUpNeeded || translateReviewPhrase(review.intelligence?.followUpNeeded || "Unclear"),
      nextAction: spanishNotes.nextAction
    };
  }

  return {
    guidanceLabel: "Guia de IA",
    quickGuidanceLabel: "Guia rapida",
    whatHappenedLabel: "Que paso",
    objectionsLabel: "Objeciones principales",
    followUpLabel: "Seguimiento necesario",
    nextActionLabel: "Siguiente accion recomendada",
    summary: translateReviewPhrase(review.summary),
    longSummary: translateReviewPhrase(review.longSummary || review.summary),
    noAiSummary: "Esta llamada todavia no tiene un resumen de IA. Haz clic en Analyze New Calls para generar un resumen real desde la transcripcion guardada.",
    objections: review.objections.length ? review.objections.map(translateReviewPhrase).join(", ") : "No se encontro ninguna",
    followUpNeeded: translateReviewPhrase(review.intelligence?.followUpNeeded || "Unclear"),
    nextAction: translateReviewPhrase(review.nextAction)
  };
}

async function translateSelectedNotes(item) {
  setBusy(true);
  els.callDetail.querySelector("#translateNotesSpanishBtn").disabled = true;
  try {
    const response = await fetch("/api/notes/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notes: {
          summary: item.review.summary,
          longSummary: item.review.longSummary || item.review.summary,
          objections: item.review.objections.join(", ") || "None found",
          followUpNeeded: item.review.intelligence?.followUpNeeded || (item.review.needsFollowUp ? "Needs action" : "No urgent action"),
          nextAction: item.review.nextAction
        }
      })
    });
    const payload = await readApiResponse(response);
    if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || "Notes translation failed");
    state.spanishNotes[item.messageId] = payload.translation || null;
    state.notesLanguage = "spanish";
    renderSelectedTranscript(item);
    showToast(payload.message || "Spanish AI notes ready");
  } catch (error) {
    showToast(error.message);
    renderSelectedTranscript(item);
  } finally {
    setBusy(false);
  }
}

function translateReviewPhrase(value) {
  const text = String(value || "");
  const replacements = [
    [/Review needed to confirm the next step\./gi, "Se necesita revisar la llamada para confirmar el siguiente paso."],
    [/Conversation includes a clear next-step signal\./gi, "La conversacion incluye una senal clara de siguiente paso."],
    [/Trust appears to be the main blocker\./gi, "La confianza parece ser el obstaculo principal."],
    [/Timing appears to be the main blocker\./gi, "El tiempo parece ser el obstaculo principal."],
    [/Financing came up; next step was discussed\./gi, "Se hablo de financiamiento y se discutio el siguiente paso."],
    [/Timing came up; next step was discussed\./gi, "Se hablo del tiempo y se discutio el siguiente paso."],
    [/Asked useful discovery questions/gi, "Hizo buenas preguntas de descubrimiento"],
    [/Created a usable conversation record/gi, "Creo un registro util de la conversacion"],
    [/Kept the conversation moving/gi, "Mantuvo la conversacion avanzando"],
    [/Confirm a specific next step before ending the call/gi, "Confirmar un siguiente paso especifico antes de terminar la llamada"],
    [/Call back and confirm appointment or next action/gi, "Volver a llamar y confirmar la cita o el siguiente paso"],
    [/Confirm appointment status and send reminder/gi, "Confirmar el estatus de la cita y enviar recordatorio"],
    [/Schedule a specific callback time/gi, "Agendar una hora especifica para volver a llamar"],
    [/Offer a joint follow-up with the decision maker/gi, "Ofrecer un seguimiento junto con la persona que toma la decision"],
    [/Send financing details and book lender follow-up/gi, "Enviar detalles de financiamiento y agendar seguimiento con lender"],
    [/Follow up with pricing range and appointment option/gi, "Dar seguimiento con rango de precio y opcion de cita"],
    [/Price/gi, "Precio"],
    [/Financing/gi, "Financiamiento"],
    [/Timing/gi, "Tiempo"],
    [/Trust/gi, "Confianza"],
    [/Decision maker/gi, "Persona que decide"],
    [/Not ready/gi, "No esta listo"]
  ];

  return replacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}

function renderTranscriptTab(item) {
  const spanishText = state.spanishTranslations[item.messageId] || "";
  const isSpanish = state.transcriptLanguage === "spanish";
  const lines = item.segments.length
    ? item.segments.slice(0, 120).map((segment) => `
      <div class="transcript-line">
        <span>${segment.speaker ? `Speaker ${escapeHtml(String(segment.speaker))}` : formatSeconds(segment.startTime)}</span>
        <p>${escapeHtml(segment.transcript || segment.text || "")}</p>
      </div>
    `).join("")
    : `<div class="transcript-line"><span>Text</span><p>${escapeHtml(item.transcriptText || "No transcript text available.")}</p></div>`;

  return `
    <div class="transcript-tab-head">
      <div>
        <h4>Full Transcript</h4>
        <span>${isSpanish ? "Spanish translation" : `${fmt(item.segments.length)} segments`}</span>
      </div>
      <div class="transcript-language-toggle">
        <button class="${!isSpanish ? "active" : ""}" data-transcript-language="original">Original</button>
        <button class="${isSpanish ? "active" : ""}" data-transcript-language="spanish">Spanish</button>
      </div>
    </div>
    ${isSpanish ? renderSpanishTranscript(item, spanishText) : `<div class="transcript-lines">${lines}</div>`}
  `;
}

function renderSpanishTranscript(item, spanishText) {
  if (!spanishText) {
    return `
      <div class="translation-empty">
        <p>This transcript has not been translated to Spanish yet.</p>
        <button class="icon-button primary" id="translateSpanishBtn">Translate to Spanish</button>
      </div>
    `;
  }

  return `
    <div class="spanish-transcript">
      ${spanishText.split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
    </div>
  `;
}

async function translateSelectedTranscript(item) {
  setBusy(true);
  els.callDetail.querySelector("#translateSpanishBtn").disabled = true;
  try {
    const response = await fetch("/api/transcripts/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: item.messageId })
    });
    const payload = await readApiResponse(response);
    if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || "Translation failed");
    state.spanishTranslations[item.messageId] = payload.translation || "";
    state.transcriptLanguage = "spanish";
    renderSelectedTranscript(item);
    showToast(payload.message || "Spanish translation ready");
  } catch (error) {
    showToast(error.message);
    renderSelectedTranscript(item);
  } finally {
    setBusy(false);
  }
}

function renderFollowUpTab(item) {
  return `
    <div class="follow-up-panel">
      <div>
        <span class="label">Next action</span>
        <strong>${escapeHtml(item.review.nextAction)}</strong>
      </div>
      <div>
        <span class="label">Reason</span>
        <p>${escapeHtml(item.review.needsFollowUp ? "This call has a follow-up signal, an objection, or an unclear next step." : "No urgent follow-up signal was detected from the saved transcript.")}</p>
      </div>
      <div>
        <span class="label">Suggested note</span>
        <p>${escapeHtml(`${item.clientName}: ${item.review.nextAction}`)}</p>
      </div>
    </div>
  `;
}

function resetTranscriptPanel() {
  state.transcripts = [];
  state.activityItems = [];
  state.reviewMode = "calls";
  state.transcriptFilter = "all";
  state.transcriptDetailTab = "summary";
  state.selectedTranscriptId = "";
  state.transcriptSearch = "";
  state.transcriptFrom = "";
  state.transcriptTo = "";
  els.transcriptFrom.value = "";
  els.transcriptTo.value = "";
  els.transcriptTools.hidden = true;
  els.objectionDashboard.hidden = true;
  els.aiReviewBar.hidden = true;
  if (els.dailyReport) {
    els.dailyReport.hidden = true;
    els.dailyReport.innerHTML = "";
  }
  els.callInbox.innerHTML = `<p class="empty-state">Load saved reviews for this company when you want to review conversations.</p>`;
  els.callDetail.innerHTML = `<p class="empty-state">Select a conversation to review the details.</p>`;
}

function renderTranscriptIntelligence(transcripts) {
  els.transcriptTools.hidden = false;

  const objectionCounts = buildObjectionInsights(transcripts);

  renderObjectionTrends(objectionCounts);
  renderObjectionPanelState();
}

function renderObjectionPanelState() {
  els.objectionTrends.hidden = !state.objectionPanelOpen;
  els.toggleObjectionsBtn.textContent = state.objectionPanelOpen ? "Hide" : "Show";
}

function renderObjectionTrends(counts) {
  els.objectionTrends.innerHTML = counts.length ? counts.slice(0, 8).map((row) => `
    <button class="objection-row ${state.expandedObjection === row.label ? "expanded" : ""}" data-objection="${escapeHtml(row.label)}">
      <div>
        <strong>${escapeHtml(row.label)}</strong>
        ${state.expandedObjection === row.label ? renderObjectionBreakdown(row) : ""}
      </div>
      <b>${fmt(row.count)}</b>
    </button>
  `).join("") : `<p class="empty-state">No objections detected yet.</p>`;

  for (const button of els.objectionTrends.querySelectorAll("[data-objection]")) {
    button.addEventListener("click", () => {
      state.expandedObjection = state.expandedObjection === button.dataset.objection ? "" : button.dataset.objection;
      renderObjectionTrends(counts);
    });
  }
}

function renderObjectionBreakdown(row) {
  return `
    <span>${escapeHtml(row.description)}</span>
    <div class="objection-breakdown">
      <small>${fmt(row.aiCount)} AI-reviewed · ${fmt(row.count - row.aiCount)} fallback</small>
      ${row.examples.length ? `
        <ul>
          ${row.examples.map((example) => `
            <li>
              <strong>${escapeHtml(example.clientName)}</strong>
              <em>${escapeHtml(example.sourceName)} · ${formatDateTime(example.dateAdded)}</em>
              <span>${escapeHtml(example.summary)}</span>
            </li>
          `).join("")}
        </ul>
      ` : ""}
    </div>
  `;
}

function buildObjectionInsights(transcripts) {
  const counts = new Map();
  for (const item of transcripts) {
    const labels = item.review.objections.map((objection) => normalizeObjectionLabel(objection));
    labels.forEach((label, index) => {
      const current = counts.get(label) || { label, count: 0, aiCount: 0, examples: [] };
      current.count += 1;
      if (item.review.hasAi) current.aiCount += 1;
      current.examples.push({
        clientName: item.clientName,
        sourceName: item.sourceName,
        dateAdded: item.dateAdded,
        summary: item.review.hasAi
          ? (item.review.longSummary || item.review.summary)
          : item.review.summary,
        primary: index === 0,
        messageId: item.messageId
      });
      counts.set(label, current);
    });
  }

  return [...counts.values()]
    .map((row) => ({
      ...row,
      examples: prepareObjectionExamples(row.examples),
      description: objectionDescription(row.label, row.aiCount, row.count)
    }))
    .sort((a, b) => b.count - a.count || b.aiCount - a.aiCount || a.label.localeCompare(b.label));
}

function prepareObjectionExamples(examples) {
  const unique = new Map();
  for (const example of examples) {
    const key = example.messageId || `${example.clientName}-${example.dateAdded}`;
    if (!unique.has(key)) unique.set(key, example);
  }

  return [...unique.values()]
    .sort((a, b) => Number(b.primary) - Number(a.primary) || new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0))
    .slice(0, 4);
}

function normalizeObjectionLabel(value) {
  const text = normalizeForReview(value);
  if (/financ|credit|credito|prestamo|lender|loan|banco/.test(text)) return "Financing";
  if (/price|pricing|precio|cost|costo|caro|budget|presupuesto|expensive/.test(text)) return "Price";
  if (/timing|time|tiempo|busy|ocupado|later|despues|después|schedule|trabaj/.test(text)) return "Timing";
  if (/trust|confianza|scam|estafa|real|seguro|proof|review/.test(text)) return "Trust";
  if (/decision|spouse|wife|husband|espos|pareja|familia|partner|owner/.test(text)) return "Decision maker";
  if (/need|not ready|no quiero|no gracias|interes|interest|ready/.test(text)) return "Not ready";
  return cleanLabel(value);
}

function objectionDescription(label, aiCount, count) {
  const source = aiCount ? `${fmt(aiCount)} AI-reviewed` : "keyword fallback";
  const descriptions = {
    Financing: "Money, credit, lender, or payment questions are showing up.",
    Price: "The client appears concerned about cost, budget, or value.",
    Timing: "The client may be busy, delaying, or unsure about when to move.",
    Trust: "The client may need proof, reassurance, or credibility before moving.",
    "Decision maker": "Another person may need to approve or join the decision.",
    "Not ready": "The client is showing low urgency or unclear intent."
  };
  return `${descriptions[label] || "Theme found in the conversation review notes."} ${source} of ${fmt(count)} mention${count === 1 ? "" : "s"}.`;
}

function cleanLabel(value) {
  return String(value || "Other").replace(/\s+/g, " ").trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function filterTranscripts(transcripts) {
  let rows = transcripts;

  if (state.transcriptFrom) {
    rows = rows.filter((item) => localDateKey(item.dateAdded) >= state.transcriptFrom);
  }

  if (state.transcriptTo) {
    rows = rows.filter((item) => localDateKey(item.dateAdded) <= state.transcriptTo);
  }

  if (state.transcriptFilter === "follow-up") {
    rows = rows.filter((item) => item.review.needsFollowUp);
  } else if (state.transcriptFilter === "ai") {
    rows = rows.filter((item) => item.review.hasAi);
  } else if (state.transcriptFilter === "needs-ai") {
    rows = rows.filter((item) => !item.review.hasAi);
  } else if (state.transcriptFilter === "needs-work") {
    rows = rows.filter((item) => item.review.qualityScore < 65);
  }

  const query = state.transcriptSearch.trim().toLowerCase();
  if (query) {
    rows = rows.filter((item) => [
      item.clientName,
      item.sourceName,
      item.review.summary,
      item.review.nextAction,
      item.review.objections.join(" ")
    ].join(" ").toLowerCase().includes(query));
  }

  return rows;
}

function filterActivityItems(items) {
  let rows = items;

  if (state.transcriptFrom) {
    rows = rows.filter((item) => localDateKey(item.dateAdded) >= state.transcriptFrom);
  }

  if (state.transcriptTo) {
    rows = rows.filter((item) => localDateKey(item.dateAdded) <= state.transcriptTo);
  }

  if (state.reviewMode === "calls") {
    rows = rows.filter((item) => item.kind === "call");
  }

  if (state.transcriptFilter === "calls") {
    rows = rows.filter((item) => item.kind === "call");
  } else if (state.transcriptFilter === "messages") {
    rows = rows.filter((item) => item.kind !== "call");
  } else if (state.transcriptFilter === "follow-up") {
    rows = rows.filter((item) => item.review?.needsFollowUp);
  } else if (state.transcriptFilter === "ai") {
    rows = rows.filter((item) => item.kind === "call" && item.review?.hasAi);
  } else if (state.transcriptFilter === "needs-ai") {
    rows = rows.filter((item) => item.kind === "call" && !item.review?.hasAi);
  }

  const query = state.transcriptSearch.trim().toLowerCase();
  if (query) {
    rows = rows.filter((item) => [
      item.clientName,
      item.sourceName,
      item.body,
      item.review?.summary,
      item.review?.nextAction,
      (item.review?.objections || []).join(" ")
    ].join(" ").toLowerCase().includes(query));
  }

  return rows.sort((a, b) => new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0));
}

function normalizeActivityItem(item, transcriptMap) {
  const id = item.id || item.messageId || `${item.conversationId}-${item.dateAdded}`;
  if (item.kind === "call") {
    const saved = transcriptMap.get(id) || null;
    return enrichTranscript({
      ...(saved || {}),
      ...item,
      id,
      messageId: id,
      activityId: id,
      kind: "call",
      typeLabel: "Call",
      transcriptText: saved?.transcriptText || item.transcriptText || item.body || "",
      segments: saved?.segments || item.segments || [],
      aiReview: saved?.aiReview || item.aiReview || null
    });
  }

  return {
    ...item,
    id,
    messageId: id,
    activityId: id,
    kind: "message",
    review: reviewMessageActivity(item)
  };
}

function reviewMessageActivity(item) {
  const text = normalizeForReview(item.body || "");
  const objections = detectObjections(text);
  const needsFollowUp = objections.length > 0 || /call|llamar|cita|appointment|confirm|confirmar|\?/.test(text);
  return {
    setter: "Unassigned",
    summary: activityPreview(item),
    longSummary: item.body || "Message activity",
    objections,
    didWell: "Message captured in GHL",
    shouldImprove: "Review the message thread if the next step is unclear",
    nextAction: needsFollowUp ? "Review and confirm the next action." : "No urgent action detected.",
    needsFollowUp,
    qualityScore: 0
  };
}

function activityPreview(item) {
  if (item.kind === "call") return item.review?.summary || item.transcriptText || "Call activity";
  return firstLine(item.body) || `${titleCase(item.typeLabel || "Message")} activity`;
}

function renderDailyReport(items) {
  if (!els.dailyReport) return;

  const calls = items.filter((item) => item.kind === "call");
  const followUps = items.filter((item) => item.review?.needsFollowUp);
  const objections = buildDailyObjectionCounts(items);
  const sheetMetrics = getDailySheetMetricsForReport();
  const summaryKey = dailySummaryKey(items);
  const executive = state.dailyExecutiveSummaries[summaryKey] || null;
  const loading = state.dailySummaryLoadingKey === summaryKey;
  const stats = state.activityTracker.stats || buildActivityDirectionStats([]);
  const trackerLoading = state.activityTracker.loading && !state.activityTracker.stats;
  const inboundMessages = stats.inboundMessages || 0;
  const outboundMessages = stats.outboundMessages || 0;
  const inboundCalls = stats.inboundCalls || 0;
  const outboundCalls = stats.outboundCalls || 0;
  const totalMessages = inboundMessages + outboundMessages;
  const totalCalls = inboundCalls + outboundCalls;
  const totalActivity = totalMessages + totalCalls;
  const shortSummary = executive?.executive_summary || buildSimpleDailyReportSummary({
    totalActivity,
    inboundMessages,
    outboundMessages,
    inboundCalls,
    outboundCalls,
    meetings: sheetMetrics.meetingsBooked,
    closedDeals: sheetMetrics.closedDeals,
    followUps: followUps.length,
    topObjection: objections[0]?.label || ""
  });
  els.dailyReport.hidden = false;
  els.dailyReport.innerHTML = `
    <div class="daily-report-head">
      <div>
        <p class="eyebrow">Resumen diario</p>
        <h3>${escapeHtml(getSelectedCompany().name)} · ${escapeHtml(summaryDateLabel())}</h3>
      </div>
      <button class="icon-button" type="button" onclick="window.print()">Imprimir</button>
    </div>
    <div class="executive-summary-card">
      <div class="executive-ai-head">
        <div>
          <span>Resumen con inteligencia artificial</span>
          <small>${trackerLoading ? "Cargando datos de hoy" : loading ? "Analizando actividad del dia" : executive ? "Reporte listo para revisar" : "Resumen rapido listo"}</small>
        </div>
        <b>AI</b>
      </div>
      <div class="executive-ai-body">
        <strong>${escapeHtml(trackerLoading ? "Cargando llamadas y mensajes de hoy..." : loading ? "Generando resumen simple del dia..." : shortSummary)}</strong>
      </div>
      ${!executive ? `<button class="icon-button primary" id="generateDailySummaryBtn" ${loading || trackerLoading ? "disabled" : ""}>${trackerLoading ? "Cargando..." : loading ? "Generando..." : "Mejorar con IA"}</button>` : ""}
    </div>
    <div class="daily-report-grid">
      <div><span>Actividad total</span><strong>${fmt(totalActivity)}</strong></div>
      <div><span>Llamadas inbound</span><strong>${fmt(inboundCalls)}</strong></div>
      <div><span>Llamadas outbound</span><strong>${fmt(outboundCalls)}</strong></div>
      <div><span>Mensajes inbound</span><strong>${fmt(inboundMessages)}</strong></div>
      <div><span>Mensajes outbound</span><strong>${fmt(outboundMessages)}</strong></div>
      <div><span>Juntas agendadas</span><strong>${fmt(sheetMetrics.meetingsBooked)}</strong></div>
      <div><span>Seguimientos</span><strong>${fmt(followUps.length)}</strong></div>
      <div><span>Cerrados</span><strong>${fmt(sheetMetrics.closedDeals)}</strong></div>
    </div>
    <div class="daily-report-section">
      <span>Objecion principal</span>
      <p>${objections.length ? objections.map((row) => `${translateReviewPhrase(row.label)} (${row.count})`).join(", ") : "No se detectaron objeciones fuertes en la actividad cargada."}</p>
    </div>
    <div class="daily-report-section">
      <span>Siguiente accion</span>
      <p>${followUps.length ? `Revisar ${fmt(followUps.length)} seguimiento${followUps.length === 1 ? "" : "s"} pendiente${followUps.length === 1 ? "" : "s"}.` : "No se detectaron seguimientos urgentes en las llamadas cargadas."}</p>
    </div>
  `;

  els.dailyReport.querySelector("#generateDailySummaryBtn")?.addEventListener("click", () => generateDailySummary(items));
}

function buildSimpleDailyReportSummary({ totalActivity, inboundMessages, outboundMessages, inboundCalls, outboundCalls, meetings, closedDeals, followUps, topObjection }) {
  const objectionText = topObjection ? ` La objecion principal fue ${translateReviewPhrase(topObjection).toLowerCase()}.` : "";
  return `Hoy se registraron ${fmt(totalActivity)} actividades: ${fmt(inboundCalls)} llamadas inbound, ${fmt(outboundCalls)} llamadas outbound, ${fmt(inboundMessages)} mensajes inbound y ${fmt(outboundMessages)} mensajes outbound. Se agendaron ${fmt(meetings)} juntas y se cerraron ${fmt(closedDeals)} clientes. Hay ${fmt(followUps)} seguimiento${followUps === 1 ? "" : "s"} pendiente${followUps === 1 ? "" : "s"}.${objectionText}`;
}

function renderExecutiveSummaryDetails(summary) {
  return `
    <div class="executive-summary-grid">
      ${renderExecutiveList("Que paso hoy", summary.operational_readout)}
      ${renderExecutiveList("Riesgos", summary.risk_signals)}
      ${renderExecutiveList("Que hacer despues", summary.priority_actions)}
    </div>
    <div class="executive-leader-note">
      <span>Nota para el lider</span>
      <p>${escapeHtml(summary.leader_note || "No hay nota adicional.")}</p>
    </div>
  `;
}

function renderExecutiveList(label, rows) {
  const items = Array.isArray(rows) ? rows.filter(Boolean) : [];
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      ${items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p>No hay una senal clara en la actividad cargada.</p>`}
    </section>
  `;
}

function getDailySheetMetricsForReport() {
  if (!state.data) return emptyMetrics();
  const selectedKey = state.selectedCompanyKey;
  const rows = selectedKey === "all"
    ? state.data.dailyRows.filter((row) => visibleCompanyKeys.has(row.sourceKey))
    : state.data.dailyRows.filter((row) => row.sourceKey === selectedKey);

  const today = dateInputValue(new Date());
  const from = state.transcriptFrom || today;
  const to = state.transcriptTo || from;
  const dailyRows = rows.filter((row) => {
    const value = row.date || "";
    if (!value) return false;
    if (from && value < from) return false;
    if (to && value > to) return false;
    return true;
  });

  const clients = (selectedKey === "all"
    ? state.data.clients.filter((client) => visibleCompanyKeys.has(client.sourceKey))
    : state.data.clients.filter((client) => client.sourceKey === selectedKey)
  ).filter((client) => {
    const value = client.date || "";
    if (!value) return false;
    if (from && value < from) return false;
    if (to && value > to) return false;
    return true;
  });

  const totals = sumMetrics(dailyRows);
  totals.closedDeals = countClosedClients(clients) || totals.closedDeals;
  return totals;
}

async function generateDailySummary(items) {
  const key = dailySummaryKey(items);
  if (state.dailyExecutiveSummaries[key] || state.dailySummaryLoadingKey === key) return;
  state.dailySummaryLoadingKey = key;
  renderDailyReport(items);

  try {
    const calls = items.filter((item) => item.kind === "call");
    const followUps = items.filter((item) => item.review?.needsFollowUp);
    const topObjections = buildDailyObjectionCounts(items);
    const sheetMetrics = getDailySheetMetricsForReport();
    const stats = state.activityTracker.stats || buildActivityDirectionStats([]);
    const messages = new Array((stats.inboundMessages || 0) + (stats.outboundMessages || 0)).fill(null);
    const response = await fetch("/api/daily-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: getSelectedCompany().name,
        dateLabel: summaryDateLabel(),
        metrics: {
          leads: sheetMetrics.leads,
          no_answer: sheetMetrics.noAnswer,
          not_qualified: sheetMetrics.notQualified,
          qualified: sheetMetrics.qualified,
          lender: sheetMetrics.lender,
          meetings_booked: sheetMetrics.meetingsBooked,
          meetings_attended: sheetMetrics.meetingsAttended,
          no_shows: sheetMetrics.noShows,
          closed_deals: sheetMetrics.closedDeals,
          total_activity: (stats.inboundMessages || 0) + (stats.outboundMessages || 0) + (stats.inboundCalls || 0) + (stats.outboundCalls || 0),
          inbound_calls: stats.inboundCalls || 0,
          outbound_calls: stats.outboundCalls || 0,
          inbound_messages: stats.inboundMessages || 0,
          outbound_messages: stats.outboundMessages || 0,
          calls: (stats.inboundCalls || 0) + (stats.outboundCalls || 0),
          messages: messages.length,
          follow_ups: followUps.length
        },
        topObjections,
        activity: items.slice(0, 80).map((item) => ({
          clientName: item.clientName,
          sourceName: item.sourceName,
          kind: item.kind,
          typeLabel: item.typeLabel,
          direction: item.direction,
          dateAdded: item.dateAdded,
          body: item.body,
          summary: activityPreview(item),
          objections: item.review?.objections || [],
          needsFollowUp: Boolean(item.review?.needsFollowUp)
        }))
      })
    });
    const payload = await readApiResponse(response);
    if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || "Daily summary failed");
    state.dailyExecutiveSummaries[key] = payload.summary || null;
  } catch (error) {
    showToast(error.message);
  } finally {
    state.dailySummaryLoadingKey = "";
    renderDailyReport(items);
  }
}

function dailySummaryKey(items) {
  const first = items[0]?.dateAdded || "";
  const last = items[items.length - 1]?.dateAdded || "";
  const stats = state.activityTracker.stats || {};
  return [
    state.selectedCompanyKey,
    summaryDateLabel(),
    stats.inboundMessages || 0,
    stats.outboundMessages || 0,
    stats.inboundCalls || 0,
    stats.outboundCalls || 0,
    items.length,
    first,
    last
  ].join("|");
}

function buildDailyObjectionCounts(items) {
  const counts = new Map();
  for (const item of items) {
    for (const objection of item.review?.objections || []) {
      const label = normalizeObjectionLabel(objection);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 5);
}

function summaryDateLabel() {
  if (state.transcriptFrom && state.transcriptTo && state.transcriptFrom === state.transcriptTo) return state.transcriptFrom;
  if (state.transcriptFrom || state.transcriptTo) return `${state.transcriptFrom || "Start"} to ${state.transcriptTo || "Today"}`;
  return dateInputValue(new Date());
}

function enrichTranscript(item) {
  return {
    ...item,
    review: reviewTranscript(item)
  };
}

function reviewTranscript(item) {
  if (item.aiReview) return reviewFromAi(item);

  const text = normalizeForReview(item.transcriptText);
  const objections = detectObjections(text);
  const positives = scoreMatches(text, [
    "gracias",
    "buenas",
    "claro",
    "perfecto",
    "le puedo",
    "le ayudo",
    "agenda",
    "cita",
    "mañana",
    "hoy",
    "seguimiento"
  ]);
  const weakSignals = scoreMatches(text, [
    "no se",
    "no puedo",
    "despues",
    "después",
    "luego",
    "ocupado",
    "no gracias",
    "no quiero",
    "no me interesa"
  ]);
  const hasNextStep = /cita|agenda|agendar|mañana|hoy|llamar|llamada|visita|oficina|seguimiento|texto|mensaje/.test(text);
  const hasQuestion = /\?|\bcu[aá]ndo\b|\bc[oó]mo\b|\bcu[aá]nto\b|\bque\b|\bqu[eé]\b/.test(text);
  const durationBonus = item.callDurationSeconds >= 60 ? 8 : item.callDurationSeconds >= 30 ? 4 : 0;

  let qualityScore = 58 + positives * 4 + durationBonus + (hasNextStep ? 10 : 0) + (hasQuestion ? 5 : 0) - objections.length * 3 - weakSignals * 4;
  qualityScore = Math.max(35, Math.min(96, Math.round(qualityScore)));

  const needsFollowUp = objections.length > 0 || !hasNextStep || /llamar|despues|después|luego|ocupado|mandando|informaci[oó]n/.test(text);
  const didWell = positives >= 3
    ? "Kept the conversation moving"
    : hasQuestion
      ? "Asked useful discovery questions"
      : "Created a usable conversation record";
  const shouldImprove = !hasNextStep
    ? "Confirm a specific next step before ending the call"
    : objections.length
      ? `Handle ${objections[0].toLowerCase()} more directly`
      : "Keep documenting the outcome clearly";

  return {
    setter: "Unassigned",
    summary: buildSummary(item, objections, hasNextStep),
    objections,
    didWell,
    shouldImprove,
    nextAction: buildNextAction(objections, hasNextStep, text),
    needsFollowUp,
    qualityScore
  };
}

function reviewFromAi(item) {
  const review = item.aiReview;
  const intelligence = parseAiIntelligence(review.summary);
  const objections = review.objections?.length ? review.objections : [];
  const didWell = review.didWell?.length ? review.didWell.join("; ") : "Not enough information in the transcript";
  const shouldImprove = review.shouldImprove?.length ? review.shouldImprove.join("; ") : "Not enough information in the transcript";
  const summary = intelligence.summary || firstLine(review.summary) || "AI notes are available for this call.";
  const longSummary = intelligence.whatHappened || formatAiLongSummary(review.summary) || summary;
  const nextAction = review.nextAction || "Review the transcript and choose the next step.";
  const needsFollowUp = /follow|callback|call back|confirm|schedule|send|unclear|review/i.test(`${nextAction} ${intelligence.followUpNeeded || ""}`);

  return {
    setter: "Unassigned",
    summary,
    longSummary,
    intelligence,
    objections,
    didWell,
    shouldImprove,
    nextAction,
    needsFollowUp,
    qualityScore: needsFollowUp ? 64 : 82,
    hasAi: true
  };
}

function parseAiIntelligence(value) {
  const fields = {};
  const map = {
    "summary": "summary",
    "what happened": "whatHappened",
    "follow-up needed": "followUpNeeded",
    "confidence": "confidence"
  };

  for (const line of String(value || "").split("\n")) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    const rawKey = line.slice(0, index).trim().toLowerCase();
    const key = map[rawKey];
    if (key) fields[key] = line.slice(index + 1).trim();
  }

  if (!fields.summary) fields.summary = firstLine(value);
  return fields;
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

async function readApiResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    if (response.status === 404 && /not found/i.test(text)) {
      return {
        ok: false,
        message: "This browser tab is connected to the older local server. Open http://localhost:4289 to use AI review notes."
      };
    }
    return {
      ok: false,
      message: text || "The server returned an unreadable response."
    };
  }
}

function formatAiLongSummary(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

function buildSummary(item, objections, hasNextStep) {
  if (objections.length && hasNextStep) return `${objections[0]} came up; next step was discussed.`;
  if (objections.length) return `${objections[0]} appears to be the main blocker.`;
  if (hasNextStep) return "Conversation includes a clear next-step signal.";
  return "Review needed to confirm the next step.";
}

function buildNextAction(objections, hasNextStep, text) {
  if (/financ|credito|crédito|prestamo|pr[eé]stamo|lender/.test(text)) return "Send financing details and book lender follow-up.";
  if (/precio|costo|cost|price|cu[aá]nto/.test(text)) return "Follow up with pricing range and appointment option.";
  if (/espos|pareja|familia|wife|husband/.test(text)) return "Offer a joint follow-up with the decision maker.";
  if (/despues|después|luego|ocupado|trabaj/.test(text)) return "Schedule a specific callback time.";
  if (!hasNextStep) return "Call back and confirm appointment or next action.";
  return "Confirm appointment status and send reminder.";
}

function detectObjections(text) {
  const patterns = [
    ["Price", /precio|costo|cost|price|caro|cu[aá]nto/],
    ["Financing", /financ|credito|crédito|prestamo|pr[eé]stamo|lender|banco/],
    ["Timing", /tiempo|ahorita|despues|después|luego|ocupado|trabaj|semana/],
    ["Trust", /seguro|confianza|scam|estafa|real|verdad/],
    ["Decision maker", /espos|pareja|familia|wife|husband|decidir/],
    ["Not ready", /no quiero|no gracias|no me interesa|todav[ií]a no|not ready/]
  ];

  return patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function countItems(items) {
  const counts = new Map();
  for (const item of items) counts.set(item, (counts.get(item) || 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function scoreMatches(text, words) {
  return words.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0);
}

function normalizeForReview(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function renderStatus(status) {
  const items = [
    ["Google Sheets", status.sheet.configured, `${status.sheet.tabs} tabs`],
    ["Supabase", status.supabase.configured, status.supabase.configured ? status.supabase.url : "Not connected"],
    ["GHL", status.ghl.configured, status.ghl.configured ? "Ready to sync" : "Needs token and location ID"],
    ["AI Reviews", status.ai.configured, status.ai.configured ? "Ready" : "Optional next step"]
  ];

  els.statusStrip.innerHTML = items.map(([label, ready, detail]) => `
    <div class="status-item">
      <span class="dot ${ready ? "" : "warn"}"></span>
      <span><strong>${label}</strong>: ${detail}</span>
    </div>
  `).join("");
}

function renderKpis(totals) {
  const adminSpend = Number(state.adminSpend || 0);
  const metaSpend = Number(totals.adSpend || 0);
  const spend = metaSpend || adminSpend;
  const spendLabel = metaSpend ? "Meta / Spend" : "Admin / Spend";
  const lenderMeetings = totals.lender || 0;
  const constructionMeetings = totals.meetingsBooked || 0;
  const totalMeetings = lenderMeetings + constructionMeetings;
  const cards = [
    ["Total Leads", fmt(totals.leads), "dark"],
    ["Lender Meetings", fmt(lenderMeetings), "", ""],
    ["Construction Meetings", fmt(constructionMeetings), "", ""],
    ["Lead to Lender %", pct(safeDivide(lenderMeetings, totals.leads)), ""],
    ["Lead to Construction %", pct(safeDivide(constructionMeetings, totals.leads)), ""],
    [spendLabel, money(spend), "wide"],
    ["Cost Per Meeting", money(safeCost(spend, totalMeetings)), ""],
    ["Cost Per Lender Meeting", money(safeCost(spend, lenderMeetings)), ""],
    ["Cost Per Construction Meeting", money(safeCost(spend, constructionMeetings)), ""]
  ];

  els.kpis.innerHTML = cards.map(([label, value, tone]) => `
    <article class="metric-card ${tone}">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");
}

function safeCost(spend, count) {
  return count ? spend / count : 0;
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
}

function renderFunnel(totals) {
  const items = [
    ["Leads", totals.leads, "100%"],
    ["Qualified", totals.qualified, `${pct(safeDivide(totals.qualified, totals.leads))} of leads`],
    ["Meetings Booked", totals.meetingsBooked, `${pct(totals.leadToMeetingRate)} of leads`],
    ["Attended", totals.meetingsAttended, `${pct(totals.attendanceRate)} of booked`],
    ["Closed", totals.closedDeals, `${pct(totals.meetingToCloseRate)} of booked`]
  ];

  els.funnel.innerHTML = items.map(([label, value, helper]) => `
    <div class="funnel-step ${label === "Closed" ? "closed" : ""}">
      <div class="funnel-shape">
        <span>${label}</span>
        <strong>${fmt(value)}</strong>
      </div>
      <small>${helper}</small>
    </div>
  `).join("");
}

function renderMeetings(clients) {
  const rows = clients.slice(0, 18);
  els.meetingCount.textContent = `${fmt(clients.length)} construction meetings`;

  if (!rows.length) {
    els.meetingList.innerHTML = `<p class="empty-state">No construction meeting rows found for this company yet.</p>`;
    return;
  }

  els.meetingList.innerHTML = rows.map((client) => `
    <div class="meeting-row ${client.status === "Closed" ? "closed" : ""}">
      <div>
        <span class="meeting-week">${client.monthName}${client.date ? ` · ${client.date}` : ""}</span>
        <strong>${client.clientName}</strong>
        <small>${client.sourceName} · ${client.appointmentSetter}</small>
      </div>
      <div class="meeting-meta">
        <span>Status</span>
        <b>${client.status}</b>
      </div>
    </div>
  `).join("");
}

function renderChart(container, rows, metric) {
  const max = Math.max(1, ...rows.map((row) => row[metric] || 0));
  container.innerHTML = rows.length ? rows.map((row) => {
    const value = row[metric] || 0;
    const width = Math.max(2, Math.round((value / max) * 100));
    return `
      <div class="bar-row">
        <span>${row.label}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
        <strong>${fmt(value)}</strong>
      </div>
    `;
  }).join("") : `<p class="empty-state">No chart data for this company yet.</p>`;
}

function renderSources(view) {
  if (!els.sourceRows) return;
  els.sourceRows.innerHTML = view.bySource.map((row) => `
    <tr>
      <td>${row.label}</td>
      <td>${fmt(row.leads)}</td>
      <td>${fmt(row.meetingsBooked)}</td>
      <td>${fmt(row.meetingsAttended)}</td>
      <td>${fmt(row.closedDeals)}</td>
      <td>${pct(row.meetingToCloseRate)}</td>
    </tr>
  `).join("");
}

function renderClients(view) {
  if (!els.clientRows || !els.clientSearch) return;
  const query = els.clientSearch.value.trim().toLowerCase();
  const rows = view.clients
    .filter((client) => !query || client.clientName.toLowerCase().includes(query) || client.status.toLowerCase().includes(query))
    .slice(0, 160);

  els.clientRows.innerHTML = rows.map((client) => `
    <tr class="client-row ${state.focusedClient?.id === client.id ? "active" : ""}" data-client-id="${escapeHtml(client.id)}" tabindex="0">
      <td>${client.clientName}</td>
      <td>${client.date || "Unknown"}</td>
      <td>${statusPill(client.status)}</td>
      <td>${client.sourceName}</td>
      <td>${client.appointmentSetter}</td>
      <td><button class="row-action" type="button">Open</button></td>
    </tr>
  `).join("");

  for (const row of els.clientRows.querySelectorAll("[data-client-id]")) {
    const client = rows.find((item) => item.id === row.dataset.clientId);
    if (!client) continue;
    row.addEventListener("click", () => openClientNotes(client));
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openClientNotes(client);
    });
  }
}

function statusPill(status) {
  const tone = status === "Closed" ? "green" : status === "Attended" ? "orange" : status === "No-show" ? "red" : "";
  return `<span class="pill ${tone}">${status}</span>`;
}

function groupClientsBySetter(clients) {
  const groups = new Map();
  for (const client of clients) {
    const key = client.appointmentSetter || "Unassigned";
    const current = groups.get(key) || { label: key, clients: 0, attended: 0, noShows: 0, closedDeals: 0 };
    current.clients += 1;
    if (client.status === "Attended") current.attended += 1;
    if (client.status === "No-show") current.noShows += 1;
    if (client.status === "Closed") current.closedDeals += 1;
    groups.set(key, current);
  }
  return [...groups.values()];
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

function weekKey(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const start = new Date(date);
  start.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return start.toISOString().slice(0, 10);
}

function getSelectedCompany() {
  return companies.find((company) => company.key === state.selectedCompanyKey) || companies[0];
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", theme.primary);
  root.style.setProperty("--brand-accent", theme.accent);
  root.style.setProperty("--brand-soft", theme.soft);
  root.style.setProperty("--brand-highlight", theme.highlight);
  document.body.classList.toggle("monochrome", Boolean(theme.monochrome));
}

function setBusy(busy) {
  for (const button of [els.refreshBtn, els.syncSheetsBtn, els.syncGhlBtn, els.syncTranscriptsBtn, els.loadTranscriptsBtn]) {
    button.disabled = busy;
  }
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2800);
}

function fmt(value) {
  return number.format(value || 0);
}

function pct(value) {
  return percentFmt.format(value || 0);
}

function safeDivide(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function formatDateTime(value) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function localDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizePersonName(value) {
  return normalizeForReview(value).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function cssEscape(value) {
  return String(value || "").replace(/["\\]/g, "\\$&");
}

function formatSeconds(value) {
  const seconds = Number(value || 0);
  if (!seconds) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}
