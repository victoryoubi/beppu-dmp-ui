// ★ ここを自分の GAS WebアプリURLに置き換え
const GA_API_URL = 'https://script.google.com/macros/s/AKfycbxLq9tdPicoHF_Ow-op7d6cG7KMFjvH8D-QQLQEEKK0dkeC1Wfr3fWWbsNZPNvc7o4H2w/exec';

let allData = [];              // 生データ（yearMonth×countryId×device）
let aggregatedByCountry = {};  // { countryId: [{yearMonth, sessions, activeUsers}, ...] }
let countryMonthlyChart = null;
let currentCountry = null;
let currentCountryData = [];   // 表示中の国のデータ（CSV出力にも利用）

// GA4データ取得
async function fetchGaData() {
  const params = new URLSearchParams({
    startDate: '2023-01-01',
    endDate: 'today'
  });
  const res = await fetch(`${GA_API_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`GA fetch error: ${res.status} ${res.statusText}`);
  }
  return await res.json(); // [{yearMonth, countryId, deviceCategory, sessions, activeUsers}, ...]
}

// "202401" → "2024-01" に整形
function formatYearMonth(ym) {
  if (!ym || ym.length !== 6) return ym;
  return `${ym.slice(0, 4)}-${ym.slice(4, 6)}`;
}

// デバイスを合算して「月別×国」に集計
function aggregateByCountry(data) {
  const map = {}; // { countryId: { yearMonth: {sessions, activeUsers} } }

  for (const row of data) {
    const ym = row.yearMonth;
    const country = row.countryId || 'UNKN';
    const sessions = Number(row.sessions) || 0;
    const activeUsers = Number(row.activeUsers) || 0;

    if (!map[country]) {
      map[country] = {};
    }
    if (!map[country][ym]) {
      map[country][ym] = { sessions: 0, activeUsers: 0 };
    }
    map[country][ym].sessions += sessions;
    map[country][ym].activeUsers += activeUsers;
  }

  const result = {};
  for (const country of Object.keys(map)) {
    const ymMap = map[country];
    const months = Object.keys(ymMap).sort(); // "202301","202302",...

    result[country] = months.map(ym => ({
      yearMonth: ym,
      sessions: ymMap[ym].sessions,
      activeUsers: ymMap[ym].activeUsers
    }));
  }

  return result;
}

function populateCountrySelect(countries) {
  const select = document.getElementById('countrySelect');
  select.innerHTML = '';

  countries.sort(); // アルファベット順
  for (const c of countries) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    select.appendChild(opt);
  }
}

// 選択国のグラフとテーブルを更新
function updateViewForCountry(countryId) {
  currentCountry = countryId;
  const data = aggregatedByCountry[countryId] || [];
  currentCountryData = data; // CSV用に保持

  const labels = data.map(d => formatYearMonth(d.yearMonth));
  const sessionsValues = data.map(d => d.sessions);
  const activeUsersValues = data.map(d => d.activeUsers);

  drawCountryMonthlyChart(labels, sessionsValues, activeUsersValues);
  fillDataTable(data);
}

// Chart.js で描画
function drawCountryMonthlyChart(labels, sessions, activeUsers) {
  const ctx = document.getElementById('countryMonthlyChart').getContext('2d');

  if (countryMonthlyChart) {
    countryMonthlyChart.destroy();
  }

  countryMonthlyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'セッション数',
          data: sessions,
          tension: 0.2
        },
        {
          label: 'アクティブユーザー数',
          data: activeUsers,
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          title: { display: true, text: '年月' }
        },
        y: {
          title: { display: true, text: '件数' },
          ticks: {
            callback: v => v.toLocaleString()
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}`
          }
        }
      }
    }
  });
}

// テーブル描画
function fillDataTable(data) {
  const tbody = document.getElementById('dataTableBody');
  tbody.innerHTML = '';

  for (const row of data) {
    const tr = document.createElement('tr');

    const tdMonth = document.createElement('td');
    tdMonth.textContent = formatYearMonth(row.yearMonth);
    tr.appendChild(tdMonth);

    const tdSessions = document.createElement('td');
    tdSessions.textContent = row.sessions.toLocaleString();
    tr.appendChild(tdSessions);

    const tdActive = document.createElement('td');
    tdActive.textContent = row.activeUsers.toLocaleString();
    tr.appendChild(tdActive);

    tbody.appendChild(tr);
  }
}

// CSVダウンロード（現表示国のみ）
function downloadCurrentCountryCsv() {
  if (!currentCountry || !currentCountryData.length) {
    alert('データがありません。');
    return;
  }

  const header = ['countryId', 'yearMonth', 'sessions', 'activeUsers'];
  const rows = currentCountryData.map(row => [
    currentCountry,
    formatYearMonth(row.yearMonth),
    row.sessions,
    row.activeUsers
  ]);

  let csv = header.join(',') + '\n' +
    rows.map(r => r.join(',')).join('\n');

  // 日本語環境でExcelを意識するなら BOM を付ける
  csv = '\uFEFF' + csv;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  const now = new Date();
  const ts = now.toISOString().slice(0, 10).replace(/-/g, '');
  a.href = url;
  a.download = `ga_monthly_${currentCountry}_${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function main() {
  try {
    allData = await fetchGaData();
    if (!allData.length) {
      console.warn('No GA data');
      return;
    }

    // 月別×国に集約
    aggregatedByCountry = aggregateByCountry(allData);

    // 国コード一覧
    const countries = Object.keys(aggregatedByCountry);
    populateCountrySelect(countries);

    // デフォルト選択：JPがあればJP、なければ先頭
    const defaultCountry = countries.includes('JP') ? 'JP' : countries[0];
    document.getElementById('countrySelect').value = defaultCountry;
    updateViewForCountry(defaultCountry);

    // イベントハンドラ
    document.getElementById('countrySelect').addEventListener('change', (e) => {
      updateViewForCountry(e.target.value);
    });

    document.getElementById('downloadBtn').addEventListener('click', () => {
      downloadCurrentCountryCsv();
    });

  } catch (err) {
    console.error(err);
    alert('GAデータの読み込みに失敗しました。コンソールを確認してください。');
  }
}

main();
