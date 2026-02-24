function byId(id) {
  return document.getElementById(id);
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function setStatus(message, isError = false) {
  const el = byId('status');
  el.textContent = message;
  el.style.color = isError ? '#ff98aa' : '#98b8cb';
}

function toQuery() {
  const chapter = byId('chapter').value.trim() || 'chapter_1';
  const seed = String(Math.max(0, Number(byId('seed').value || 2026)));
  const wave = String(Math.max(1, Number(byId('wave').value || 1)));
  const maxWaves = String(Math.max(1, Number(byId('maxWaves').value || 20)));

  const query = new URLSearchParams();
  query.set('chapter', chapter);
  query.set('seed', seed);
  query.set('wave', wave);
  query.set('maxWaves', maxWaves);
  return query;
}

function renderEvents(events) {
  const tbody = byId('events-table').querySelector('tbody');
  tbody.innerHTML = '';

  for (const event of events) {
    const tr = document.createElement('tr');
    const binding = event.renderBinding || null;
    const payload = event.payload || {};
    const srcId = payload.srcId || payload.sourceId || '-';
    const animation = binding ? binding.animation : '-';
    const sheetPath = binding ? binding.sheetPath : '-';

    tr.innerHTML = `
      <td>${event.eventIndex}</td>
      <td>${event.time}</td>
      <td>${event.type}</td>
      <td>${srcId}</td>
      <td>${animation}</td>
      <td>${sheetPath}</td>
    `;
    tbody.appendChild(tr);
  }
}

async function runPreview() {
  const query = toQuery();
  const url = `/api/run?${query.toString()}`;
  setStatus('실행 중...');

  try {
    const response = await fetch(url);
    const payload = await response.json();

    if (!response.ok || payload.ok !== true) {
      byId('summary').textContent = pretty(payload.error || payload);
      byId('hud').textContent = '{}';
      byId('first-binding').textContent = '{}';
      byId('unit-map').textContent = '{}';
      renderEvents([]);
      setStatus('실행 실패', true);
      return;
    }

    const value = payload.value || {};
    byId('summary').textContent = pretty(value.summary || {});
    byId('hud').textContent = pretty(value.hud || {});
    byId('first-binding').textContent = pretty(value.diagnostics?.firstBoundEvent || {});
    byId('unit-map').textContent = pretty(value.render?.runtimeUnitVisualMap || {});
    renderEvents(value.render?.events || []);
    setStatus('실행 완료');
  } catch (error) {
    byId('summary').textContent = pretty({
      code: 'FETCH_FAILED',
      message: error && error.message ? error.message : String(error),
    });
    byId('hud').textContent = '{}';
    byId('first-binding').textContent = '{}';
    byId('unit-map').textContent = '{}';
    renderEvents([]);
    setStatus('네트워크 오류', true);
  }
}

function main() {
  const form = byId('run-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runPreview();
  });

  runPreview();
}

main();
