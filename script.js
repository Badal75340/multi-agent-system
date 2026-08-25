/* =========================================================
   research.console — script.js
   Talks directly to the user's existing FastAPI backend:
     uvicorn main:app --reload --port 2200
   Endpoints used (unchanged, as provided):
     GET  /api/health   -> { status, missing_env_vars }
     POST /api/research -> { topic } => { topic, search_results,
                              scraped_content, report, feedback,
                              duration_seconds }
========================================================= */

const API_BASE = 'https://multi-agent-system-3-3v69.onrender.com';

const el = (id) => document.getElementById(id);

/* ---------------------------------------------------------
   DOM refs
--------------------------------------------------------- */
const researchForm   = el('researchForm');
const topicInput     = el('topicInput');
const runBtn         = el('runBtn');
const runTag         = el('runTag');
const apiBaseLabel   = el('apiBaseLabel');

const errorBanner    = el('errorBanner');
const errorTitle     = el('errorTitle');
const errorMessage   = el('errorMessage');
const errorDismiss   = el('errorDismiss');

const pipelineTrack  = el('pipelineTrack');
const consoleFeed    = el('consoleFeed');

const metaSources    = el('metaSources');
const metaScore      = el('metaScore');
const metaWords      = el('metaWords');
const metaDuration   = el('metaDuration');

const resultsPanel   = el('resultsPanel');
const resultTabs     = el('resultTabs');
const copyBtn        = el('copyBtn');
const downloadBtn    = el('downloadBtn');

const statusDot      = el('statusDot');
const statusText     = el('statusText');
const toastStack     = el('toastStack');

apiBaseLabel.textContent = API_BASE;

/* ---------------------------------------------------------
   Stage definitions — mirrors the 4 real backend steps
--------------------------------------------------------- */
const STAGES = [
  { id:'search',  name:'Search Agent',  desc:'Finds recent, reliable sources on the topic', icon:'search',        durMin:1300, durMax:2000 },
  { id:'reader',  name:'Reader Agent',  desc:'Scrapes the most relevant page in depth',      icon:'file-search-2', durMin:1300, durMax:2000 },
  { id:'writer',  name:'Writer Chain',  desc:'Drafts the structured research report',        icon:'pen-line',      durMin:1500, durMax:2300 },
  { id:'critic',  name:'Critic Chain',  desc:'Scores the report and gives feedback',         icon:'shield-check',  durMin:1200, durMax:1800 },
];

let state = {
  running: false,
  topic: '',
  currentReport: '',
  startedAt: null,
};

/* ---------------------------------------------------------
   Utilities
--------------------------------------------------------- */
function nowTime(){ return new Date().toTimeString().slice(0,8); }
function rand(min, max){ return Math.floor(Math.random() * (max - min + 1)) + min; }
function refreshIcons(){ if (window.lucide) lucide.createIcons(); }
function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function showToast(message, type='info', icon='info'){
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<i data-lucide="${icon}"></i><span>${escapeHtml(message)}</span>`;
  toastStack.appendChild(t);
  refreshIcons();
  setTimeout(() => {
    t.classList.add('is-leaving');
    setTimeout(() => t.remove(), 250);
  }, 3600);
}

/* ---------------------------------------------------------
   Backend health check
--------------------------------------------------------- */
async function checkHealth(){
  try{
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();
    if (data.status === 'ok'){
      statusDot.className = 'status-dot is-ok';
      statusText.textContent = 'backend online';
    } else {
      statusDot.className = 'status-dot is-warn';
      statusText.textContent = `missing: ${(data.missing_env_vars || []).join(', ') || 'env vars'}`;
    }
  } catch(err){
    statusDot.className = 'status-dot is-err';
    statusText.textContent = 'backend unreachable';
  }
}

/* ---------------------------------------------------------
   Pipeline track build
--------------------------------------------------------- */
function connectorSvg(){
  return `<div class="stage-connector"><svg viewBox="0 0 34 2" preserveAspectRatio="none">
    <line class="trace-line" x1="0" y1="1" x2="34" y2="1"></line>
    <circle class="trace-pulse pulse" r="2.5" cx="0" cy="1"></circle>
  </svg></div>`;
}

function stageHtml(stage, index){
  return `
  <div class="stage" data-stage="${stage.id}">
    <div class="stage-top">
      <div class="stage-icon"><i data-lucide="${stage.icon}"></i></div>
      <span class="stage-index">0${index + 1}</span>
    </div>
    <div>
      <div class="stage-name">${stage.name}</div>
      <div class="stage-desc">${stage.desc}</div>
    </div>
    <div class="stage-wave">
      <span></span><span></span><span></span><span></span><span></span>
    </div>
    <div class="stage-status">Idle</div>
  </div>`;
}

function buildPipeline(){
  pipelineTrack.innerHTML = STAGES
    .map((s, i) => stageHtml(s, i) + (i < STAGES.length - 1 ? connectorSvg() : ''))
    .join('');
  refreshIcons();
  animatePulses();
}

let pulseRAF = null;
function animatePulses(){
  const pulses = pipelineTrack.querySelectorAll('.pulse');
  let t = 0;
  cancelAnimationFrame(pulseRAF);
  function step(){
    t += 0.012;
    pulses.forEach((p, i) => {
      const svg = p.closest('svg');
      const w = svg.viewBox.baseVal.width;
      const phase = (t + i * 0.2) % 1;
      p.setAttribute('cx', phase * w);
      p.style.opacity = state.running ? 1 : 0;
    });
    pulseRAF = requestAnimationFrame(step);
  }
  step();
}

function setStage(id, status){
  const node = pipelineTrack.querySelector(`.stage[data-stage="${id}"]`);
  if (!node) return;
  node.classList.remove('is-active', 'is-done', 'is-error');
  const statusEl = node.querySelector('.stage-status');
  if (status === 'active'){ node.classList.add('is-active'); statusEl.textContent = 'Working'; }
  else if (status === 'done'){ node.classList.add('is-done'); statusEl.textContent = 'Done'; }
  else if (status === 'error'){ node.classList.add('is-error'); statusEl.textContent = 'Error'; }
  else statusEl.textContent = 'Idle';
}

function resetPipeline(){
  STAGES.forEach(s => setStage(s.id, 'idle'));
}

/* ---------------------------------------------------------
   Console log
--------------------------------------------------------- */
function log(text, isError=false){
  if (consoleFeed.querySelector('.console-empty')) consoleFeed.innerHTML = '';
  const row = document.createElement('div');
  row.className = `console-row${isError ? ' is-error' : ''}`;
  row.innerHTML = `<span class="console-time">${nowTime()}</span><span class="console-text">${text}</span>`;
  consoleFeed.appendChild(row);
  consoleFeed.scrollTop = consoleFeed.scrollHeight;
}

/* ---------------------------------------------------------
   Error banner
--------------------------------------------------------- */
function showError(title, message){
  errorTitle.textContent = title;
  errorMessage.textContent = message;
  errorBanner.hidden = false;
}
function hideError(){ errorBanner.hidden = true; }
errorDismiss.addEventListener('click', hideError);

/* ---------------------------------------------------------
   Backend call
--------------------------------------------------------- */
async function callBackend(topic){
  let res;
  try{
    res = await fetch(`${API_BASE}/api/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    });
  } catch (networkErr){
    throw new Error(`NETWORK::Could not reach the backend at ${API_BASE}. Make sure it's running: uvicorn main:app --reload --port 2200`);
  }

  if (!res.ok){
    let detail = `Request failed with status ${res.status}.`;
    try{
      const body = await res.json();
      if (body.detail){
        detail = typeof body.detail === 'string'
          ? body.detail
          : JSON.stringify(body.detail);
      }
    } catch(e){ /* body wasn't JSON — keep default detail */ }
    throw new Error(`HTTP::${detail}`);
  }

  return res.json();
}

/* ---------------------------------------------------------
   Stage animation helpers (visual pacing only — the real work
   happens server-side in one blocking call)
--------------------------------------------------------- */
function animateStage(stage){
  return new Promise((resolve) => {
    setStage(stage.id, 'active');
    log(`<strong>${stage.name}</strong>: ${stage.desc.toLowerCase()}…`);
    const duration = rand(stage.durMin, stage.durMax);
    setTimeout(() => {
      setStage(stage.id, 'done');
      resolve();
    }, duration);
  });
}

/* ---------------------------------------------------------
   Validation
--------------------------------------------------------- */
function validateTopic(topic){
  if (!topic) return 'Enter a research topic to get started.';
  if (topic.length < 3) return 'Topic must be at least 3 characters.';
  if (topic.length > 300) return 'Topic must be under 300 characters.';
  return null;
}

/* ---------------------------------------------------------
   Main run
--------------------------------------------------------- */
async function runResearch(topic){
  if (state.running) return;

  hideError();
  state.running = true;
  state.topic = topic;
  state.startedAt = performance.now();

  runBtn.classList.add('is-loading');
  runBtn.disabled = true;
  runTag.textContent = 'Running';
  runTag.className = 'run-tag is-live';
  resultsPanel.hidden = true;
  resetPipeline();
  consoleFeed.innerHTML = '';
  [metaSources, metaScore, metaWords, metaDuration].forEach(m => m.textContent = '—');

  log(`Research started for "<strong>${escapeHtml(topic)}</strong>" → ${escapeHtml(API_BASE)}`);

  // Fire the real request now; it runs in parallel with the visual pacing below.
  const fetchPromise = callBackend(topic);

  // Animate the first three stages purely for feedback while the backend works.
  for (const stage of STAGES.slice(0, -1)){
    await animateStage(stage);
  }

  // Hold on the critic stage until the backend actually responds.
  const finalStage = STAGES[STAGES.length - 1];
  setStage(finalStage.id, 'active');
  log(`<strong>${finalStage.name}</strong>: waiting for the backend to finish…`);

  let data;
  try{
    data = await fetchPromise;
  } catch(err){
    handleError(err, finalStage.id);
    return;
  }

  setStage(finalStage.id, 'done');
  finishResearch(data);
}

function handleError(err, stageId){
  state.running = false;
  runBtn.classList.remove('is-loading');
  runBtn.disabled = false;
  runTag.textContent = 'Error';
  runTag.className = 'run-tag is-error';
  setStage(stageId, 'error');

  const raw = err.message || 'The research pipeline failed.';
  const [kind, message] = raw.includes('::') ? raw.split('::') : ['GENERIC', raw];

  const title = kind === 'NETWORK' ? 'Backend unreachable' : 'Research failed';
  showError(title, message);
  log(`<strong>Error:</strong> ${escapeHtml(message)}`, true);
  showToast(title, 'warn', 'alert-triangle');
}

/* ---------------------------------------------------------
   Result parsing helpers
--------------------------------------------------------- */
function extractUrls(text){
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s\)\]"']+/g) || [];
  const seen = new Set();
  const out = [];
  matches.forEach(u => {
    const clean = u.replace(/[.,;:]+$/, '');
    if (!seen.has(clean)){ seen.add(clean); out.push(clean); }
  });
  return out;
}
function parseCriticScore(feedback){
  if (!feedback) return null;
  const m = feedback.match(/Score:\s*([\d.]+)\s*\/\s*10/i);
  return m ? m[1] : null;
}

/* ---------------------------------------------------------
   Finish + render results
--------------------------------------------------------- */
function finishResearch(data){
  state.running = false;
  runBtn.classList.remove('is-loading');
  runBtn.disabled = false;
  runTag.textContent = 'Completed';
  runTag.className = 'run-tag is-done';

  const sources = extractUrls(data.search_results);
  const score = parseCriticScore(data.feedback);
  const words = (data.report || '').trim().split(/\s+/).filter(Boolean).length;

  metaSources.textContent = sources.length;
  metaScore.textContent = score ? `${score}/10` : '—';
  metaWords.textContent = words ? `${words}w` : '—';
  metaDuration.textContent = `${data.duration_seconds}s`;

  log(`<strong>Done ✓</strong> report ready in ${data.duration_seconds}s`);
  showToast('Research complete', 'ok', 'check-circle-2');

  const reportText = data.report || '(no report returned)';
  const criticText = data.feedback || '(no critic feedback returned)';
  const sourcesText = [
    'SEARCH RESULTS',
    '='.repeat(40),
    data.search_results || '(none)',
    '',
    'SCRAPED CONTENT',
    '='.repeat(40),
    data.scraped_content || '(none)',
  ].join('\n');

  el('tab-report').textContent = reportText;
  el('tab-critic').textContent = criticText;
  el('tab-sources').textContent = sourcesText;

  state.currentReport = `${reportText}\n\n${'='.repeat(40)}\nCRITIC REVIEW\n${'='.repeat(40)}\n${criticText}`;

  resultsPanel.hidden = false;
  resultsPanel.scrollIntoView({ behavior:'smooth', block:'nearest' });
  refreshIcons();
}

/* ---------------------------------------------------------
   Tabs
--------------------------------------------------------- */
resultTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  resultTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('is-active', b === btn));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('is-active'));
  el(`tab-${btn.dataset.tab}`).classList.add('is-active');
});

/* ---------------------------------------------------------
   Result actions
--------------------------------------------------------- */
copyBtn.addEventListener('click', async () => {
  if (!state.currentReport){ showToast('Run a research task first', 'warn', 'alert-triangle'); return; }
  try{
    await navigator.clipboard.writeText(state.currentReport);
    showToast('Copied to clipboard', 'ok', 'copy');
  } catch(e){
    showToast('Could not copy — select text manually', 'warn', 'alert-triangle');
  }
});

downloadBtn.addEventListener('click', () => {
  if (!state.currentReport){ showToast('Run a research task first', 'warn', 'alert-triangle'); return; }
  const blob = new Blob([state.currentReport], { type:'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `research-${(state.topic || 'report').slice(0,24).replace(/\s+/g,'-').toLowerCase()}.txt`;
  a.click();
  showToast('Report downloaded', 'ok', 'download');
});

/* ---------------------------------------------------------
   Form wiring + validation
--------------------------------------------------------- */
researchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const topic = topicInput.value.trim();
  const validationError = validateTopic(topic);
  if (validationError){
    showError('Check your topic', validationError);
    topicInput.focus();
    return;
  }
  runResearch(topic);
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') researchForm.requestSubmit();
});

/* ---------------------------------------------------------
   Init
--------------------------------------------------------- */
function init(){
  refreshIcons();
  buildPipeline();
  checkHealth();
}
document.addEventListener('DOMContentLoaded', init);
