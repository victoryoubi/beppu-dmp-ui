// ★ここを自分のバケットに置き換え
const DATA_URL = 'https://storage.googleapis.com/beppu_dmp/peopleflow/beppu/top_meshcode_2024_000000000000.json';

// NDJSON → 配列
async function fetchNdjson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  return text
    .trim()
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line));
}

// month のソート用ヘルパ（"2024-01" 形式を前提）
function sortMonthStrings(months) {
  return [...new Set(months)] // unique
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  try {
    const rows = await fetchNdjson(DATA_URL);
    if (!rows.length) {
      console.warn('No data');
      return;
    }

    // ---- 月別 total（全国籍合計） ----
    const monthTotalsMap = new Map(); // month -> total allday
    for (const row of rows) {
      const month = row.month;          // "2024-01" 想定
      const allday = Number(row.allday) || 0;
      const current = monthTotalsMap.get(month) || 0;
      monthTotalsMap.set(month, current + allday);
    }

    const sortedMonths = sortMonthStrings(Array.from(monthTotalsMap.keys()));
    const monthlyTotals = sortedMonths.map(m => monthTotalsMap.get(m));

    // ---- 最新月の国別シェア ----
    const latestMonth = sortedMonths[sortedMonths.length - 1];
    const latestRows = rows.filter(r => r.month === latestMonth);

    const countryMap = new Map(); // country -> total allday (最新月)
    for (const row of latestRows) {
      const country = row.country || '不明';
      const allday = Number(row.allday) || 0;
      const current = countryMap.get(country) || 0;
      countryMap.set(country, current + allday);
    }

    // 国別は降順ソート（上位だけに絞るならここで slice）
    const sortedCountries = Array.from(countryMap.entries())
      .sort((a, b) => b[1] - a[1]);

    const countries = sortedCountries.map(([c]) => c);
    const countryValues = sortedCountries.map(([, v]) => v);

    // ---- Chart.js で描画 ----
    drawMonthlyTotalChart(sortedMonths, monthlyTotals);
    drawLatestMonthCountryChart(latestMonth, countries, countryValues);

  } catch (err) {
    console.error(err);
    alert('データの読み込みに失敗しました。コンソールを確認してください。');
  }
}

function drawMonthlyTotalChart(labels, values) {
  const ctx = document.getElementById('monthlyTotalChart').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'allday（全国籍合計）',
        data: values,
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true },
        tooltip: { callbacks: {
          label: (ctx) => ` ${ctx.parsed.y.toLocaleString()} 人`
        }}
      },
      scales: {
        x: {
          title: { display: true, text: '月' }
        },
        y: {
          title: { display: true, text: 'allday（人）' },
          ticks: {
            callback: (value) => value.toLocaleString()
          }
        }
      }
    }
  });
}

function drawLatestMonthCountryChart(latestMonth, countries, values) {
  const labelEl = document.getElementById('latestMonthLabel');
  if (labelEl) {
    labelEl.textContent = `対象月：${latestMonth}`;
  }

  const ctx = document.getElementById('latestMonthCountryChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: countries,
      datasets: [{
        label: `allday（${latestMonth}）`,
        data: values
      }]
    },
    options: {
      indexAxis: 'y', // 横棒
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          label: (ctx) => ` ${ctx.parsed.x.toLocaleString()} 人`
        }}
      },
      scales: {
        x: {
          title: { display: true, text: 'allday（人）' },
          ticks: {
            callback: (value) => value.toLocaleString()
          }
        },
        y: {
          title: { display: true, text: '国籍' }
        }
      }
    }
  });
}

main();
