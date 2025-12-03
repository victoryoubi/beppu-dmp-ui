// immigration.js

// ====== 設定エリア ======
const GCS_BASE_URL = "https://storage.googleapis.com/beppu_dmp/immigration/year/";

const PORT_DEFINITIONS = [
  { id: "oitaairport",    label: "大分空港" },
  { id: "oitaport",       label: "大分港" },
  { id: "saganosekiport", label: "佐賀関港" },
];

// ====== グローバル変数 ======
const dataCache = {};   // { portId: jsonData }
let currentPortId = "oitaairport";
let currentFlow = "入国";
let currentNationality = null;
let trendChart = null;

// ====== データ取得まわり ======
async function loadPortData(portId) {
  if (dataCache[portId]) return dataCache[portId];

  const url = GCS_BASE_URL + portId + ".json";
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("データ取得に失敗しました: " + url);
  }
  const json = await res.json();
  dataCache[portId] = json;
  return json;
}

function getLatestYearKey(data) {
  const years = Object.keys(data)
    .map(y => parseInt(y, 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);
  if (years.length === 0) return null;
  return String(years[years.length - 1]);
}

function unique(array) {
  return Array.from(new Set(array));
}

// ====== 最新年 内訳テーブル ======
function renderLatestBreakdownTable(data) {
  const latestYearKey = getLatestYearKey(data);
  const tbody = document.querySelector("#latestBreakdownTable tbody");
  const infoDiv = document.getElementById("latestYearInfo");

  tbody.innerHTML = "";
  if (!latestYearKey) {
    infoDiv.textContent = "データがありません";
    return;
  }

  infoDiv.textContent = `最新年：${latestYearKey}年`;

  const latest = data[latestYearKey] || {};
  const inData  = latest["入国"] || {};
  const outData = latest["出国"] || {};

  const allCountries = unique([
    ...Object.keys(inData),
    ...Object.keys(outData)
  ]).filter(name => name !== "総数");

  allCountries.sort();

  allCountries.forEach(country => {
    const tr = document.createElement("tr");

    const tdCountry = document.createElement("td");
    tdCountry.textContent = country;
    tr.appendChild(tdCountry);

    const tdIn = document.createElement("td");
    tdIn.textContent = inData[country] != null ? inData[country] : 0;
    tr.appendChild(tdIn);

    const tdOut = document.createElement("td");
    tdOut.textContent = outData[country] != null ? outData[country] : 0;
    tr.appendChild(tdOut);

    tbody.appendChild(tr);
  });
}

// ====== 国籍候補（総数含む） ======
function getNationalityOptions(data, flow) {
  const years = Object.keys(data);
  const names = new Set();

  years.forEach(year => {
    const yearData = data[year] || {};
    const flowData = yearData[flow] || {};
    Object.keys(flowData).forEach(name => {
      names.add(name); // 「総数」も含めてOK（プルダウンで選びたいので）
    });
  });

  const list = Array.from(names);
  list.sort();
  return list;
}

function populateNationalitySelect(data, flow) {
  const select = document.getElementById("nationalitySelect");
  const options = getNationalityOptions(data, flow);

  select.innerHTML = "";

  if (options.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "データなし";
    select.appendChild(opt);
    currentNationality = "";
    return;
  }

  options.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });

  if (!options.includes(currentNationality)) {
    currentNationality = options[0];
  }
  select.value = currentNationality;
}

// ====== 年推移の系列取得 ======
function getYearlySeries(data, flow, nationality) {
  const years = Object.keys(data)
    .map(y => parseInt(y, 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);

  const labels = [];
  const values = [];

  years.forEach(year => {
    const yearKey = String(year);
    const yearData = data[yearKey] || {};
    const flowData = yearData[flow] || {};
    const val = flowData[nationality] != null ? flowData[nationality] : 0;

    labels.push(yearKey);
    values.push(val);
  });

  return { labels, values };
}

// ====== Chart.js で年推移描画 ======
function renderTrendChart(data, flow, nationality) {
  const ctx = document.getElementById("trendChart").getContext("2d");
  const { labels, values } = getYearlySeries(data, flow, nationality);

  if (trendChart) {
    trendChart.destroy();
  }

  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: `${flow} - ${nationality}`,
        data: values,
        tension: 0.2,
        fill: false,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true
        },
        title: {
          display: false
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "年"
          }
        },
        y: {
          title: {
            display: true,
            text: "人数"
          },
          beginAtZero: true
        }
      }
    }
  });
}

// ====== CSV ダウンロード共通 ======
function downloadCSV(filename, rows) {
  const csvLines = rows.map(row =>
    row.map(value => {
      const str = value == null ? "" : String(value);
      if (/[",\n]/.test(str)) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(",")
  );
  const csvContent = csvLines.join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 最新内訳CSV
function handleDownloadLatestCsv(data) {
  const latestYearKey = getLatestYearKey(data);
  if (!latestYearKey) return;

  const latest = data[latestYearKey] || {};
  const inData  = latest["入国"] || {};
  const outData = latest["出国"] || {};

  const allCountries = unique([
    ...Object.keys(inData),
    ...Object.keys(outData)
  ]).filter(name => name !== "総数");

  allCountries.sort();

  const rows = [];
  rows.push(["年", "国籍", "入国", "出国"]);

  allCountries.forEach(country => {
    rows.push([
      latestYearKey,
      country,
      inData[country] != null ? inData[country] : 0,
      outData[country] != null ? outData[country] : 0
    ]);
  });

  downloadCSV(`latest_breakdown_${currentPortId}_${latestYearKey}.csv`, rows);
}

// 年推移CSV（現在の種別＋国籍）
function handleDownloadTrendCsv(data, flow, nationality) {
  if (!nationality) return;
  const { labels, values } = getYearlySeries(data, flow, nationality);

  const rows = [];
  rows.push(["年", `${flow}_${nationality}`]);

  labels.forEach((year, i) => {
    rows.push([year, values[i]]);
  });

  downloadCSV(`trend_${currentPortId}_${flow}_${nationality}.csv`, rows);
}

// ====== 画面全体更新 ======
async function updateAll() {
  const data = await loadPortData(currentPortId);
  renderLatestBreakdownTable(data);
  populateNationalitySelect(data, currentFlow);
  renderTrendChart(data, currentFlow, currentNationality);
}

// ====== ログイン＋イベント初期化 ======
function showApp() {
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  // ログイン後にダッシュボード初期描画
  updateAll().catch(err => {
    console.error(err);
    alert("データの読み込みに失敗しました");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // --- ダッシュボード側のイベント設定 ---
  const portSelect = document.getElementById("portSelect");
  const flowSelect = document.getElementById("flowSelect");
  const nationalitySelect = document.getElementById("nationalitySelect");
  const downloadLatestBtn = document.getElementById("downloadLatestCsvBtn");
  const downloadTrendBtn = document.getElementById("downloadTrendCsvBtn");

  portSelect.addEventListener("change", async (e) => {
    currentPortId = e.target.value;
    await updateAll();
  });

  flowSelect.addEventListener("change", (e) => {
    currentFlow = e.target.value;
    loadPortData(currentPortId).then(data => {
      populateNationalitySelect(data, currentFlow);
      renderTrendChart(data, currentFlow, currentNationality);
    });
  });

  nationalitySelect.addEventListener("change", async (e) => {
    currentNationality = e.target.value;
    const data = await loadPortData(currentPortId);
    renderTrendChart(data, currentFlow, currentNationality);
  });

  downloadLatestBtn.addEventListener("click", async () => {
    const data = await loadPortData(currentPortId);
    handleDownloadLatestCsv(data);
  });

  downloadTrendBtn.addEventListener("click", async () => {
    const data = await loadPortData(currentPortId);
    handleDownloadTrendCsv(data, currentFlow, currentNationality);
  });

  // --- ログイン制御（index.htmlと同じキー） ---
  const PASSWORD = 'beppu2024';        // 必要あれば index.html と合わせて変更
  const KEY = 'beppu_dmp_logged_in';   // 共通キー

  const loggedIn = localStorage.getItem(KEY) === 'true';

  if (loggedIn) {
    // 既にログイン済みなら即表示
    showApp();
  } else {
    const form = document.getElementById('loginForm');
    const passwordInput = document.getElementById('passwordInput');
    const errorEl = document.getElementById('loginError');

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      const value = passwordInput.value.trim();

      if (value === PASSWORD) {
        localStorage.setItem(KEY, 'true');
        showApp();
      } else {
        errorEl.textContent = 'パスワードが違います。';
        passwordInput.value = '';
        passwordInput.focus();
      }
    });
  }
});
