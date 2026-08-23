/* =========================================================
   NEXUS AI — script.js
========================================================= */

/* ---------------------------------------------------------
   DOM Elements
--------------------------------------------------------- */
const el = (id) => document.getElementById(id);

const topicInput      = el('topicInput');
const depthSelect      = el('depthSelect');
const agentCountSelect = el('agentCountSelect');
const startBtn         = el('startBtn');
const resetBtn         = el('resetBtn');

const agentFlow        = el('agentFlow');
const workspaceTag     = el('workspaceTag');
const activityFeed     = el('activityFeed');
const ringFill         = el('ringFill');
const progressPct      = el('progressPct');
const currentAgentLabel= el('currentAgentLabel');
const sourcesRatio     = el('sourcesRatio');
const claimsRatio      = el('claimsRatio');

const resultsSection   = el('resultsSection');
const summaryText      = el('summaryText');
const findingsGrid     = el('findingsGrid');
const sourcesTableBody = el('sourcesTableBody');
const reportDoc        = el('reportDoc');
const reportDocFull    = el('reportDocFull');

const historyList      = el('historyList');
const historySearch     = el('historySearch');
const historyFilter     = el('historyFilter');

const toastStack        = el('toastStack');

/* ---------------------------------------------------------
   State
--------------------------------------------------------- */
const AGENTS = [
  { id:'research',  name:'Research Agent',      desc:'Defines scope & objectives', icon:'brain-circuit' },
  { id:'search',     name:'Web Search Agent',     desc:'Scans live web sources',     icon:'search' },
  { id:'analysis',   name:'Data Analysis Agent',  desc:'Extracts structured signal', icon:'bar-chart-3' },
  { id:'factcheck',  name:'Fact Checker Agent',   desc:'Verifies claims for accuracy', icon:'shield-check' },
  { id:'citation',   name:'Citation Agent',       desc:'Builds source references',   icon:'quote' },
  { id:'summarize',  name:'Summarization Agent',  desc:'Synthesizes key findings',   icon:'layers' },
  { id:'report',     name:'Report Generator',     desc:'Compiles the final report',  icon:'file-text' },
];

const STEPS = [
  { agent:'research',  from:0,  to:10, status:'INITIALIZING', label:'Initializing research task…' },
  { agent:'search',     from:10, to:30, status:'WORKING',      label:'Searching web sources…' },
  { agent:'analysis',   from:30, to:50, status:'WORKING',      label:'Analyzing collected information…' },
  { agent:'factcheck',  from:50, to:65, status:'VERIFYING',    label:'Verifying claims…' },
  { agent:'citation',   from:65, to:75, status:'WORKING',      label:'Generating citations…' },
  { agent:'summarize',  from:75, to:90, status:'WORKING',      label:'Synthesizing findings…' },
  { agent:'report',     from:90, to:100,status:'WORKING',      label:'Generating final research report…' },
];

const SOURCE_TYPES = ['Academic','News','Web','Report','Government'];

let state = {
  running: false,
  progress: 0,
  topic: '',
  depth: 'Standard',
  agentCount: 7,
  stats: { sourcesFound:0, sourcesVerified:0, claimsVerified:0, agentsActive:0, accuracy:0, researchTime:0 },
  agentRuntime: {},   // id -> { status, progress, sources, claims, time, tokens, timeline: [] }
  charts: {},
  history: [],
  currentReport: '',
  startedAt: null,
};

AGENTS.forEach(a => {
  state.agentRuntime[a.id] = { status:'IDLE', progress:0, sources:0, claims:0, time:0, tokens:0, timeline:[] };
});

/* ---------------------------------------------------------
   Utilities
--------------------------------------------------------- */
function nowTime(){
  const d = new Date();
  return d.toTimeString().slice(0,8);
}
function rand(min, max){ return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr){ return arr[rand(0, arr.length - 1)]; }
function refreshIcons(){ if(window.lucide) lucide.createIcons(); }
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function showToast(message, type='info', icon='info'){
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<i data-lucide="${icon}"></i><span>${message}</span>`;
  toastStack.appendChild(t);
  refreshIcons();
  setTimeout(() => {
    t.classList.add('is-leaving');
    setTimeout(() => t.remove(), 260);
  }, 3200);
}

/* ---------------------------------------------------------
   Navigation (topnav + sidebar + mobile)
--------------------------------------------------------- */
function setActiveView(view){
  document.querySelectorAll('.nav-link, .side-link').forEach(b => {
    b.classList.toggle('is-active', b.dataset.view === view);
  });
  document.querySelectorAll('.view').forEach(v => v.classList.remove('is-active'));
  const target = el(`view-${view}`);
  if (target) target.classList.add('is-active');
  else el('view-dashboard').classList.add('is-active'); // agents/reports/settings fallback to dashboard sections
  closeMobileSidebar();
}
document.querySelectorAll('[data-view]').forEach(btn => {
  btn.addEventListener('click', () => setActiveView(btn.dataset.view));
});

function openMobileSidebar(){
  el('sidebar').classList.add('is-open');
  el('sidebarOverlay').classList.add('is-open');
}
function closeMobileSidebar(){
  el('sidebar').classList.remove('is-open');
  el('sidebarOverlay').classList.remove('is-open');
}
el('hamburgerBtn').addEventListener('click', openMobileSidebar);
el('sidebarOverlay').addEventListener('click', closeMobileSidebar);

/* ---------------------------------------------------------
   Theme toggle
--------------------------------------------------------- */
const themeBtn = el('themeBtn');
function setTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  themeBtn.innerHTML = theme === 'light' ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
  refreshIcons();
}
themeBtn.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  setTheme(cur);
  updateChartTheme();
});

/* ---------------------------------------------------------
   Notifications button (simple demo)
--------------------------------------------------------- */
el('notifBtn').addEventListener('click', () => showToast('No new notifications', 'info', 'bell'));

/* ---------------------------------------------------------
   Agent Flow build
--------------------------------------------------------- */
function hConnector(){
  return `<div class="flow-connector"><svg viewBox="0 0 56 40" preserveAspectRatio="none">
    <line class="flow-line" x1="0" y1="20" x2="56" y2="20"></line>
    <circle class="flow-particle particle" r="3" cx="0" cy="20"></circle>
  </svg></div>`;
}
function vConnector(){
  return `<div class="flow-connector-v"><svg viewBox="0 0 40 34" preserveAspectRatio="none">
    <line class="flow-line" x1="20" y1="0" x2="20" y2="34"></line>
    <circle class="flow-particle particle" r="3" cx="20" cy="0"></circle>
  </svg></div>`;
}
function agentNodeHtml(agent){
  return `
  <div class="agent-node" data-agent="${agent.id}" tabindex="0">
    <div class="agent-node-check"><i data-lucide="check"></i></div>
    <div class="agent-node-icon"><i data-lucide="${agent.icon}"></i></div>
    <div class="agent-node-name">${agent.name}</div>
    <div class="agent-node-desc">${agent.desc}</div>
    <div class="agent-node-status">IDLE</div>
    <div class="agent-node-bar"><div class="agent-node-bar-fill"></div></div>
  </div>`;
}

function buildAgentFlow(){
  const [research, search, analysis, factcheck, citation, summarize, report] = AGENTS;
  agentFlow.innerHTML = `
    <div class="flow-row">${agentNodeHtml(research)}</div>
    ${vConnector()}
    <div class="flow-row">${agentNodeHtml(search)}</div>
    ${vConnector()}
    <div class="flow-row">
      ${agentNodeHtml(analysis)}${hConnector()}${agentNodeHtml(factcheck)}
    </div>
    ${vConnector()}
    <div class="flow-row">${agentNodeHtml(citation)}</div>
    ${vConnector()}
    <div class="flow-row">${agentNodeHtml(summarize)}</div>
    ${vConnector()}
    <div class="flow-row">${agentNodeHtml(report)}</div>
  `;
  refreshIcons();
  animateParticles();

  agentFlow.querySelectorAll('.agent-node').forEach(node => {
    node.addEventListener('click', () => openAgentModal(node.dataset.agent));
    node.addEventListener('keypress', (e) => { if(e.key === 'Enter') openAgentModal(node.dataset.agent); });
  });
}

let particleRAF = null;
function animateParticles(){
  const particles = agentFlow.querySelectorAll('.particle');
  let t = 0;
  cancelAnimationFrame(particleRAF);
  function step(){
    t += 0.012;
    particles.forEach((p, i) => {
      const svg = p.closest('svg');
      const isVertical = svg.viewBox.baseVal.height > svg.viewBox.baseVal.width;
      const phase = (t + i * 0.15) % 1;
      if (isVertical){
        const h = svg.viewBox.baseVal.height;
        p.setAttribute('cy', phase * h);
      } else {
        const w = svg.viewBox.baseVal.width;
        p.setAttribute('cx', phase * w);
      }
      p.style.opacity = state.running ? 1 : 0.25;
    });
    particleRAF = requestAnimationFrame(step);
  }
  step();
}

/* ---------------------------------------------------------
   Agent status rendering
--------------------------------------------------------- */
function setAgentStatus(id, status, progress){
  const rt = state.agentRuntime[id];
  rt.status = status;
  if (progress !== undefined) rt.progress = progress;

  const node = agentFlow.querySelector(`.agent-node[data-agent="${id}"]`);
  if (!node) return;
  node.classList.remove('is-working','is-verifying','is-completed','is-error');
  const statusEl = node.querySelector('.agent-node-status');
  const barFill = node.querySelector('.agent-node-bar-fill');
  statusEl.textContent = status;
  barFill.style.width = `${rt.progress}%`;

  if (status === 'WORKING' || status === 'INITIALIZING') node.classList.add('is-working');
  if (status === 'VERIFYING') node.classList.add('is-verifying');
  if (status === 'COMPLETED') node.classList.add('is-completed');
  if (status === 'ERROR') node.classList.add('is-error');
}

/* ---------------------------------------------------------
   Activity logger
--------------------------------------------------------- */
function logActivity(text){
  if (activityFeed.querySelector('.activity-empty')) activityFeed.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'activity-row';
  row.innerHTML = `<span class="activity-time">${nowTime()}</span><span class="activity-dot"></span><span class="activity-text">${text}</span>`;
  activityFeed.appendChild(row);
  activityFeed.scrollTop = activityFeed.scrollHeight;
}

function logToTimeline(agentId, text){
  state.agentRuntime[agentId].timeline.push({ time: nowTime(), text });
}

/* ---------------------------------------------------------
   Progress system
--------------------------------------------------------- */
const RING_CIRC = 2 * Math.PI * 60; // r=60
function setProgress(pct){
  state.progress = pct;
  const offset = RING_CIRC - (pct / 100) * RING_CIRC;
  ringFill.style.strokeDashoffset = offset;
  progressPct.textContent = `${Math.round(pct)}%`;
}

/* ---------------------------------------------------------
   Counter animation
--------------------------------------------------------- */
function animateCounter(elm, target, duration=900, suffixEl=null){
  const start = parseInt(elm.textContent) || 0;
  const t0 = performance.now();
  function tick(now){
    const p = clamp((now - t0) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = Math.round(start + (target - start) * eased);
    elm.childNodes[0].nodeValue = val;
    if (p < 1) requestAnimationFrame(tick);
  }
  if (elm.childNodes.length === 0) elm.appendChild(document.createTextNode('0'));
  requestAnimationFrame(tick);
}
function updateStat(key, value, unit){
  state.stats[key] = value;
  const elm = document.querySelector(`[data-stat="${key}"]`);
  if (!elm) return;
  const unitEl = elm.querySelector('.unit');
  elm.innerHTML = '';
  elm.appendChild(document.createTextNode('0'));
  if (unitEl) elm.appendChild(unitEl);
  animateCounter(elm, value);
}

/* ---------------------------------------------------------
   Charts
--------------------------------------------------------- */
function chartColors(){
  const style = getComputedStyle(document.documentElement);
  return {
    text: style.getPropertyValue('--text-1').trim(),
    grid: style.getPropertyValue('--border').trim(),
    cyan: style.getPropertyValue('--cyan').trim(),
    blue: style.getPropertyValue('--blue').trim(),
    violet: style.getPropertyValue('--violet').trim(),
  };
}

function initCharts(){
  const c = chartColors();
  Chart.defaults.font.family = "Inter, sans-serif";
  Chart.defaults.color = c.text;

  state.charts.activity = new Chart(el('activityChart'), {
    type: 'line',
    data: {
      labels: ['0s','2s','4s','6s','8s','10s','12s','14s'],
      datasets: [{
        label: 'Actions / sec',
        data: [0,0,0,0,0,0,0,0],
        borderColor: c.cyan,
        backgroundColor: 'rgba(34,211,238,0.12)',
        fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2,
      }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ grid:{ color:c.grid, drawTicks:false }, border:{ display:false } },
        y:{ grid:{ color:c.grid, drawTicks:false }, border:{ display:false }, beginAtZero:true }
      }
    }
  });

  state.charts.performance = new Chart(el('performanceChart'), {
    type: 'bar',
    data: {
      labels: ['Research','Search','Data','Fact-Check','Citation','Report'],
      datasets: [{
        label:'Efficiency %',
        data: [0,0,0,0,0,0],
        backgroundColor: [c.cyan, c.blue, c.violet, c.cyan, c.blue, c.violet],
        borderRadius: 6, maxBarThickness: 34,
      }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ grid:{ display:false }, border:{ display:false } },
        y:{ grid:{ color:c.grid }, border:{ display:false }, beginAtZero:true, max:100 }
      }
    }
  });

  state.charts.distribution = new Chart(el('distributionChart'), {
    type: 'doughnut',
    data: {
      labels: SOURCE_TYPES,
      datasets: [{
        data: [1,1,1,1,1],
        backgroundColor: [c.violet, c.blue, c.cyan, '#34d399', '#fbbf24'],
        borderWidth: 0,
      }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      cutout:'68%',
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, padding:12, font:{ size:11 } } } }
    }
  });
}

function updateChartTheme(){
  const c = chartColors();
  Chart.defaults.color = c.text;
  Object.values(state.charts).forEach(chart => {
    if (chart.config.type !== 'doughnut'){
      chart.options.scales.x.grid.color = c.grid;
      chart.options.scales.y.grid.color = c.grid;
    }
    chart.update();
  });
}

function updateActivityChart(){
  const data = state.charts.activity.data.datasets[0].data;
  data.shift();
  data.push(rand(2, 14));
  state.charts.activity.update('none');
}
function updatePerformanceChart(){
  state.charts.performance.data.datasets[0].data = AGENTS.slice(0,6).map(a => state.agentRuntime[a.id].progress);
  state.charts.performance.update('none');
}
function finalizeDistributionChart(){
  state.charts.distribution.data.datasets[0].data = SOURCE_TYPES.map(() => rand(4, 22));
  state.charts.distribution.update();
}

/* ---------------------------------------------------------
   Research Engine (simulation)
--------------------------------------------------------- */
let activityInterval = null;

async function runResearch(){
  if (state.running) return;
  const topic = topicInput.value.trim();
  if (!topic){
    showToast('Enter a research topic first', 'warn', 'alert-triangle');
    topicInput.focus();
    return;
  }

  resetResearchState(false);
  state.running = true;
  state.topic = topic;
  state.depth = depthSelect.value;
  state.agentCount = parseInt(agentCountSelect.value);
  state.startedAt = performance.now();

  startBtn.classList.add('is-loading');
  startBtn.disabled = true;
  workspaceTag.textContent = 'Running';
  workspaceTag.classList.add('is-live');
  workspaceTag.classList.remove('is-done');

  logActivity(`Research initialized for "<strong>${escapeHtml(topic)}</strong>" (${state.depth}, ${state.agentCount} agents)`);
  updateStat('agentsActive', state.agentCount);

  activityInterval = setInterval(updateActivityChart, 900);

  for (const step of STEPS){
    await runStep(step);
  }

  finishResearch();
}

function runStep(step){
  return new Promise((resolve) => {
    const agent = AGENTS.find(a => a.id === step.agent);
    currentAgentLabel.textContent = agent.name;
    setAgentStatus(step.agent, step.status, step.from);
    logActivity(`<strong>${agent.name}</strong>: ${step.label}`);
    logToTimeline(step.agent, step.label);

    const duration = rand(1300, 1900);
    const stepStart = performance.now();
    const span = step.to - step.from;

    // Populate incidental stats for specific steps
    if (step.agent === 'search'){
      setTimeout(() => {
        const sources = rand(18, 28);
        updateStat('sourcesFound', sources);
        sourcesRatio.textContent = `${sources} / ${sources + rand(4,10)}`;
        logActivity(`${sources} sources discovered`);
      }, duration * 0.55);
    }
    if (step.agent === 'analysis'){
      setTimeout(() => {
        const claims = rand(70, 96);
        state.agentRuntime.analysis.claims = claims;
        claimsRatio.textContent = `${claims} / ${claims + rand(6,14)}`;
        logActivity(`${claims} claims identified`);
      }, duration * 0.6);
    }
    if (step.agent === 'factcheck'){
      setTimeout(() => {
        const verified = rand(60, 88);
        updateStat('claimsVerified', verified);
        logActivity(`${verified} claims verified`);
      }, duration * 0.6);
    }
    if (step.agent === 'citation'){
      setTimeout(() => {
        const verified = rand(state.stats.sourcesFound - 8, state.stats.sourcesFound - 2);
        updateStat('sourcesVerified', Math.max(0, verified));
      }, duration * 0.7);
    }

    const t0 = performance.now();
    function tick(now){
      const p = clamp((now - t0) / duration, 0, 1);
      const val = step.from + span * p;
      setProgress(val);
      state.agentRuntime[step.agent].progress = clamp(step.from + span * p, 0, 100);
      const node = agentFlow.querySelector(`.agent-node[data-agent="${step.agent}"] .agent-node-bar-fill`);
      if (node) node.style.width = `${state.agentRuntime[step.agent].progress}%`;
      updatePerformanceChart();
      if (p < 1){
        requestAnimationFrame(tick);
      } else {
        state.agentRuntime[step.agent].time = +(duration/1000).toFixed(1);
        state.agentRuntime[step.agent].tokens = rand(4000, 16000);
        setAgentStatus(step.agent, 'COMPLETED', 100);
        logToTimeline(step.agent, 'Task completed');
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });
}

function finishResearch(){
  clearInterval(activityInterval);
  state.running = false;
  startBtn.classList.remove('is-loading');
  startBtn.disabled = false;
  workspaceTag.textContent = 'Completed';
  workspaceTag.classList.remove('is-live');
  workspaceTag.classList.add('is-done');
  currentAgentLabel.textContent = 'All agents complete';

  const elapsed = +(((performance.now() - state.startedAt) / 1000)).toFixed(1);
  updateStat('accuracy', rand(89, 97));
  updateStat('researchTime', elapsed);

  logActivity(`<strong>Research complete ✓</strong> — report ready`);
  showToast('Research complete', 'ok', 'check-circle-2');

  finalizeDistributionChart();
  buildResults();
  addHistoryEntry();
  refreshIcons();
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ---------------------------------------------------------
   Results building
--------------------------------------------------------- */
const FINDING_ICONS = ['trending-up','cpu','factory','alert-octagon','rocket'];
const FINDING_TITLES = ['Market Growth','Emerging Technologies','Industry Adoption','Major Challenges','Future Opportunities'];

function buildResults(){
  const topic = state.topic;

  summaryText.textContent = `The research indicates that ${topic} is an actively evolving area, with converging signals across ${state.stats.sourcesFound} sources analyzed and ${state.stats.claimsVerified} claims independently verified. Findings point to accelerating adoption, meaningful technical progress, and a set of open challenges worth monitoring as the space matures.`;

  findingsGrid.innerHTML = FINDING_TITLES.map((title, i) => `
    <div class="finding-card">
      <div class="finding-top">
        <span class="finding-num">0${i+1}</span>
        <div class="finding-icon"><i data-lucide="${FINDING_ICONS[i]}"></i></div>
      </div>
      <div class="finding-title">${title}</div>
      <div class="finding-desc">Analysis of ${topic} shows notable signal related to ${title.toLowerCase()}, supported by multiple cross-referenced sources.</div>
      <div class="finding-relevance">${rand(80,98)}% relevance</div>
    </div>
  `).join('');

  const sourceRows = Array.from({ length: 6 }).map(() => {
    const type = pick(SOURCE_TYPES);
    const badgeClass = { Academic:'badge-academic', News:'badge-news', Web:'badge-report', Report:'badge-report', Government:'badge-gov' }[type];
    return `<tr>
      <td>${topic} — ${pick(['Research 2026','Industry Trends','Field Report','Analysis Brief','Outlook Study','Technical Review'])}</td>
      <td><span class="badge ${badgeClass}">${type}</span></td>
      <td>${rand(80,97)}%</td>
      <td><span class="badge badge-verified"><i data-lucide="check" style="width:11px;height:11px"></i> Verified</span></td>
      <td>2026</td>
    </tr>`;
  }).join('');
  sourcesTableBody.innerHTML = sourceRows;

  const report = buildReportText(topic);
  state.currentReport = report;
  reportDoc.textContent = report;
  reportDocFull.textContent = report;

  resultsSection.classList.add('is-ready');
  resultsSection.scrollIntoView({ behavior:'smooth', block:'nearest' });
  refreshIcons();
}

function buildReportText(topic){
  return `RESEARCH REPORT
${topic}

EXECUTIVE SUMMARY
This report synthesizes findings from ${state.stats.sourcesFound} sources on "${topic}", verified through a ${state.agentCount}-agent research pipeline at ${state.depth} depth.

1. INTRODUCTION
This report examines the current state of "${topic}", drawing on recent web sources, structured data analysis, and independent fact-checking.

2. RESEARCH METHODOLOGY
A multi-agent pipeline was used: a search agent gathered sources, a data analysis agent extracted claims, a fact-checking agent verified them, and citation/summarization agents compiled the findings below.

3. KEY FINDINGS
${FINDING_TITLES.map((t,i) => `${i+1}. ${t} — supported by cross-referenced sources with ${rand(80,98)}% relevance.`).join('\n')}

4. DATA ANALYSIS
${state.stats.claimsVerified} of the identified claims were independently verified, yielding an estimated research accuracy of ${state.stats.accuracy}%.

5. INDUSTRY TRENDS
Adoption signals suggest continued momentum, with multiple independent sources corroborating similar trajectories for "${topic}".

6. CHALLENGES
Open questions remain around scalability, standardization, and long-term reliability of current approaches.

7. FUTURE OPPORTUNITIES
Areas of highest potential include deeper automation, cross-domain integration, and improved verification tooling.

8. CONCLUSION
Overall, the evidence gathered supports a cautiously optimistic outlook for "${topic}", with continued monitoring recommended as the field evolves.

REFERENCES
Compiled from ${state.stats.sourcesFound} sources across academic, news, web, report, and government categories. Full citation list available in the Sources panel.`;
}

/* ---------------------------------------------------------
   Report actions
--------------------------------------------------------- */
el('viewReportBtn').addEventListener('click', () => {
  if (!state.currentReport){ showToast('Run a research task first', 'warn', 'alert-triangle'); return; }
  el('reportModalBackdrop').classList.add('is-open');
});
el('reportModalClose').addEventListener('click', () => el('reportModalBackdrop').classList.remove('is-open'));
el('reportModalBackdrop').addEventListener('click', (e) => { if (e.target === el('reportModalBackdrop')) e.currentTarget.classList.remove('is-open'); });

el('downloadReportBtn').addEventListener('click', () => {
  if (!state.currentReport){ showToast('Run a research task first', 'warn', 'alert-triangle'); return; }
  const blob = new Blob([state.currentReport], { type:'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nexus-report-${(state.topic || 'research').slice(0,24).replace(/\s+/g,'-').toLowerCase()}.txt`;
  a.click();
  showToast('Report downloaded', 'ok', 'download');
});

el('copyReportBtn').addEventListener('click', async () => {
  if (!state.currentReport){ showToast('Run a research task first', 'warn', 'alert-triangle'); return; }
  try{
    await navigator.clipboard.writeText(state.currentReport);
    showToast('Report copied to clipboard', 'ok', 'copy');
  } catch(e){
    showToast('Could not copy — select text manually', 'warn', 'alert-triangle');
  }
});

el('shareReportBtn').addEventListener('click', () => {
  if (!state.currentReport){ showToast('Run a research task first', 'warn', 'alert-triangle'); return; }
  showToast('Share link copied to clipboard', 'ok', 'share-2');
  navigator.clipboard?.writeText(`NEXUS AI Report: ${state.topic}`).catch(()=>{});
});

/* ---------------------------------------------------------
   Agent Modal
--------------------------------------------------------- */
function openAgentModal(agentId){
  const agent = AGENTS.find(a => a.id === agentId);
  const rt = state.agentRuntime[agentId];
  el('modalIcon').innerHTML = `<i data-lucide="${agent.icon}"></i>`;
  el('modalTitle').textContent = agent.name.toUpperCase();
  el('modalStatus').textContent = rt.status;
  el('modalTask').textContent = agent.desc;
  el('modalProgress').textContent = `${Math.round(rt.progress)}%`;
  el('modalSources').textContent = state.stats.sourcesFound || 0;
  el('modalClaims').textContent = rt.claims || state.stats.claimsVerified || 0;
  el('modalTime').textContent = `${rt.time || 0}s`;
  el('modalTokens').textContent = (rt.tokens || 0).toLocaleString();

  const timelineList = el('timelineList');
  timelineList.innerHTML = rt.timeline.length
    ? rt.timeline.map(t => `<div class="timeline-item"><span class="dot"></span><span class="time">${t.time}</span><span>${t.text}</span></div>`).join('')
    : `<div class="timeline-item"><span class="dot"></span><span>No activity yet</span></div>`;

  el('modalBackdrop').classList.add('is-open');
  refreshIcons();
}
el('modalClose').addEventListener('click', () => el('modalBackdrop').classList.remove('is-open'));
el('modalBackdrop').addEventListener('click', (e) => { if (e.target === el('modalBackdrop')) e.currentTarget.classList.remove('is-open'); });

/* ---------------------------------------------------------
   History
--------------------------------------------------------- */
function addHistoryEntry(){
  const entry = {
    id: Date.now(),
    topic: state.topic,
    date: new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }),
    agents: state.agentCount,
    sources: state.stats.sourcesFound,
    status: 'completed',
  };
  state.history.unshift(entry);
  renderHistory();
}

function renderHistory(){
  const query = (historySearch.value || '').toLowerCase();
  const filter = historyFilter.value;
  const items = state.history.filter(h => {
    const matchesQuery = h.topic.toLowerCase().includes(query);
    const matchesFilter = filter === 'all' || h.status === filter;
    return matchesQuery && matchesFilter;
  });

  if (!items.length){
    historyList.innerHTML = `<div class="activity-empty">No research history yet. Run a research task to see it here.</div>`;
    return;
  }

  historyList.innerHTML = items.map(h => `
    <div class="history-item">
      <div class="history-main">
        <div class="history-title">${escapeHtml(h.topic)}</div>
        <div class="history-meta">
          <span><i data-lucide="calendar"></i> ${h.date}</span>
          <span><i data-lucide="bot"></i> ${h.agents} Agents</span>
          <span><i data-lucide="link-2"></i> ${h.sources} Sources</span>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <span class="history-status ${h.status}">${h.status}</span>
        <button class="btn-chip" data-history-view="${h.id}"><i data-lucide="eye"></i> View Report</button>
      </div>
    </div>
  `).join('');
  refreshIcons();

  historyList.querySelectorAll('[data-history-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveView('dashboard');
      el('viewReportBtn').click();
    });
  });
}
historySearch.addEventListener('input', renderHistory);
historyFilter.addEventListener('change', renderHistory);

/* ---------------------------------------------------------
   Reset
--------------------------------------------------------- */
function resetResearchState(showToastMsg = true){
  clearInterval(activityInterval);
  state.running = false;
  state.progress = 0;
  AGENTS.forEach(a => { state.agentRuntime[a.id] = { status:'IDLE', progress:0, sources:0, claims:0, time:0, tokens:0, timeline:[] }; });

  setProgress(0);
  currentAgentLabel.textContent = '—';
  sourcesRatio.textContent = '0 / 0';
  claimsRatio.textContent = '0 / 0';
  workspaceTag.textContent = 'Idle';
  workspaceTag.classList.remove('is-live','is-done');
  activityFeed.innerHTML = `<div class="activity-empty">Activity will appear here once research starts.</div>`;

  ['sourcesFound','sourcesVerified','claimsVerified','agentsActive','accuracy','researchTime'].forEach(k => updateStat(k, 0));

  buildAgentFlow();
  resultsSection.classList.remove('is-ready');
  startBtn.classList.remove('is-loading');
  startBtn.disabled = false;

  if (showToastMsg) showToast('Workspace reset', 'info', 'rotate-ccw');
}

/* ---------------------------------------------------------
   Event wiring
--------------------------------------------------------- */
startBtn.addEventListener('click', runResearch);
resetBtn.addEventListener('click', () => resetResearchState(true));
topicInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runResearch(); });

/* Keyboard shortcuts */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape'){
    el('modalBackdrop').classList.remove('is-open');
    el('reportModalBackdrop').classList.remove('is-open');
    closeMobileSidebar();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter'){ runResearch(); }
  if (e.key === '/' && document.activeElement !== topicInput){
    e.preventDefault();
    topicInput.focus();
  }
});

/* ---------------------------------------------------------
   Init
--------------------------------------------------------- */
function init(){
  refreshIcons();
  buildAgentFlow();
  initCharts();
  renderHistory();
  setProgress(0);
}
document.addEventListener('DOMContentLoaded', init);
