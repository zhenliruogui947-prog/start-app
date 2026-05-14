// ===== 状態管理 =====
let trains = [];
let alarmTimeStr = null;
let isAlarmRinging = false;
let audioCtx = null;
let alarmBeepInterval = null;
let wakeupTimeStr = null;
let isBadWeather = false;
let savedLocation = null;
let selectedSound = 'beep'; // 'beep' | 'melody' | 'gentle'
let snoozeCount = 0;
const SNOOZE_MAX = 5;
const SNOOZE_MIN = 3;
let omikujiTimer = null;
let omikujiEnabled = true;

// ===== おみくじ定義 =====
const FORTUNES = [
    { label: '最高の1日',     emoji: '🌟', color: '#713F12' },
    { label: '平和な1日',     emoji: '🌸', color: '#701A75' },
    { label: 'うれしい1日',   emoji: '😊', color: '#14532D' },
    { label: '忙しい1日',     emoji: '💨', color: '#1E3A8A' },
    { label: '注意が必要な日', emoji: '⚠️', color: '#7C2D12' },
];

function getDailyFortune() {
    const d = new Date();
    const seed = `${d.getFullYear()}${d.getMonth()}${d.getDate()}`;
    let hash = 0;
    for (const c of seed) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    return FORTUNES[hash % FORTUNES.length];
}

// ===== 天気コード定義 =====
const WEATHER_INFO = {
    0:  { label: '快晴',             icon: '☀️' },
    1:  { label: 'おおむね晴れ',     icon: '🌤️' },
    2:  { label: '一部曇り',         icon: '⛅' },
    3:  { label: '曇り',             icon: '☁️' },
    45: { label: '霧',               icon: '🌫️' },
    48: { label: '着氷性の霧',       icon: '🌫️' },
    51: { label: '霧雨（弱）',       icon: '🌦️' },
    53: { label: '霧雨（並）',       icon: '🌦️' },
    55: { label: '霧雨（強）',       icon: '🌦️' },
    56: { label: '凍る霧雨',         icon: '🌧️' },
    57: { label: '激しい凍る霧雨',   icon: '🌧️' },
    61: { label: '雨（弱）',         icon: '🌧️' },
    63: { label: '雨（並）',         icon: '🌧️' },
    65: { label: '雨（強）',         icon: '🌧️' },
    66: { label: '凍る雨',           icon: '🌧️' },
    67: { label: '激しい凍る雨',     icon: '🌧️' },
    71: { label: '雪（弱）',         icon: '🌨️' },
    73: { label: '雪（並）',         icon: '🌨️' },
    75: { label: '雪（強）',         icon: '❄️' },
    77: { label: '霧雪',             icon: '🌨️' },
    80: { label: 'にわか雨（弱）',   icon: '🌦️' },
    81: { label: 'にわか雨（並）',   icon: '🌧️' },
    82: { label: 'にわか雨（激）',   icon: '⛈️' },
    85: { label: 'にわか雪（弱）',   icon: '🌨️' },
    86: { label: 'にわか雪（強）',   icon: '❄️' },
    95: { label: '雷雨',             icon: '⛈️' },
    96: { label: '雹を伴う雷雨',     icon: '⛈️' },
    99: { label: '激しい雷雨',       icon: '⛈️' },
};

const BAD_WEATHER_CODES = new Set([
    45, 48, 51, 53, 55, 56, 57,
    61, 63, 65, 66, 67,
    71, 73, 75, 77,
    80, 81, 82, 85, 86,
    95, 96, 99
]);

// ===== DOM参照 =====
const clockEl              = document.getElementById('clock');
const currentDateEl        = document.getElementById('currentDate');
const wakeupTimeEl         = document.getElementById('wakeupTime');
const wakeupBreakdownEl    = document.getElementById('wakeupBreakdown');
const weatherIconEl        = document.getElementById('weatherIcon');
const weatherNameEl        = document.getElementById('weatherName');
const weatherAlertBadgeEl  = document.getElementById('weatherAlertBadge');
const locationTextEl       = document.getElementById('locationText');
const locationSearchPanel  = document.getElementById('locationSearchPanel');
const locationSearchInput  = document.getElementById('locationSearchInput');
const locationResultsEl    = document.getElementById('locationResults');
const trainListEl          = document.getElementById('trainList');
const alarmDisplayEl       = document.getElementById('alarmDisplay');
const cancelAlarmBtnEl     = document.getElementById('cancelAlarmBtn');
const alarmOverlayEl       = document.getElementById('alarmOverlay');
const toastEl              = document.getElementById('toast');

// ===== 時計更新 =====
function updateClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    clockEl.textContent = `${hh}:${mm}:${ss}`;

    const days = ['日', '月', '火', '水', '木', '金', '土'];
    currentDateEl.textContent =
        `${now.getMonth() + 1}月${now.getDate()}日（${days[now.getDay()]}）`;

    if (alarmTimeStr && `${hh}:${mm}` === alarmTimeStr && !isAlarmRinging) {
        triggerAlarm();
    }
}

// ===== 時刻変換ユーティリティ =====
function toMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function toTimeStr(totalMinutes) {
    const mins = ((totalMinutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

// ===== 起床時刻計算 =====
function calculateWakeup() {
    const departureStr = document.getElementById('departureTime').value;
    const prepTime     = parseInt(document.getElementById('prepTime').value)  || 60;
    const walkTime     = parseInt(document.getElementById('walkTime').value)  || 0;
    const useWeather   = document.getElementById('weatherToggle').checked;

    if (!departureStr) {
        showToast('出発時刻を入力してください');
        return;
    }

    const departureMin = toMinutes(departureStr);
    let wakeupMin;
    let selectedTrain = null;
    let actualDepartureMin = departureMin;

    if (trains.length > 0) {
        // 駅への到着時刻を算出し、それ以降の最初の電車を探す
        const arriveAtStation = departureMin + walkTime;
        const sorted = [...trains].sort((a, b) => toMinutes(a) - toMinutes(b));
        selectedTrain = sorted.find(t => toMinutes(t) >= arriveAtStation) || null;

        if (selectedTrain) {
            actualDepartureMin = toMinutes(selectedTrain) - walkTime;
        }
    }

    wakeupMin = actualDepartureMin - prepTime;

    const weatherAdjusted = useWeather && isBadWeather;
    if (weatherAdjusted) wakeupMin -= 15;

    wakeupTimeStr = toTimeStr(wakeupMin);
    wakeupTimeEl.textContent = wakeupTimeStr;

    // 内訳表示
    let rows = '';

    if (selectedTrain) {
        rows += row('🚃', '乗車電車', `${selectedTrain}発`);
        rows += row('🚶', `駅まで徒歩${walkTime}分`, `${toTimeStr(actualDepartureMin)} 出発`);
    } else {
        rows += row('🚪', '出発時刻', departureStr);
        if (walkTime > 0) rows += row('🚶', `駅まで徒歩${walkTime}分`, '');
    }

    rows += row('🪥', `準備時間 ${prepTime}分`, '');

    if (weatherAdjusted) {
        rows += `<div class="breakdown-alert">☔ 悪天候のため 15分 早めました</div>`;
    }

    wakeupBreakdownEl.innerHTML = rows;
    renderTrainList(selectedTrain);
    showToast(`推奨起床時刻：${wakeupTimeStr}`);

    // 起床時刻が決まったので天気予報を更新
    if (savedLocation) fetchWeather();
}

function row(emoji, label, value) {
    return `<div class="breakdown-row">
        <span class="breakdown-label">${emoji} ${label}</span>
        ${value ? `<span class="breakdown-value">${value}</span>` : ''}
    </div>`;
}

// ===== 電車管理 =====
function renderTrainList(selectedTrain = null) {
    if (trains.length === 0) {
        trainListEl.innerHTML = '<div class="empty-trains">電車時刻が登録されていません</div>';
        return;
    }

    const sorted = [...trains].sort((a, b) => toMinutes(a) - toMinutes(b));
    trainListEl.innerHTML = sorted.map(t => {
        const isSelected = t === selectedTrain;
        return `
        <div class="train-item ${isSelected ? 'selected' : ''}">
            <div class="train-item-left">
                <span class="train-item-time">🚃 ${t}</span>
                ${isSelected ? '<span class="train-badge">乗車予定</span>' : ''}
            </div>
            <button class="btn-remove" data-time="${t}" title="削除">×</button>
        </div>`;
    }).join('');
}

trainListEl.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-remove')) {
        const time = e.target.dataset.time;
        trains = trains.filter(t => t !== time);
        saveData();
        renderTrainList();
    }
});

document.getElementById('addTrainBtn').addEventListener('click', () => {
    const input = document.getElementById('trainTimeInput');
    const val = input.value;
    if (!val) { showToast('時刻を入力してください'); return; }
    if (trains.includes(val)) { showToast('その時刻はすでに登録されています'); return; }
    trains.push(val);
    input.value = '';
    saveData();
    renderTrainList();
    showToast(`${val} を追加しました`);
});

// ===== 天気取得（Open-Meteo hourly API - 起床時刻の時間帯の予報を取得） =====
async function fetchWeatherByCoords(lat, lon, locationName) {
    weatherNameEl.textContent = '取得中...';
    weatherAlertBadgeEl.style.display = 'none';

    try {
        const url = `https://api.open-meteo.com/v1/forecast`
            + `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
            + `&hourly=weathercode&timezone=auto&forecast_days=2`;
        const data = await (await fetch(url)).json();

        const targetHour = wakeupTimeStr ? parseInt(wakeupTimeStr.split(':')[0]) : 7;
        const code = getWeatherCodeForHour(data, targetHour);
        const timeLabel = wakeupTimeStr ? `${wakeupTimeStr} ごろの予報` : `${String(targetHour).padStart(2,'0')}:00 ごろの予報`;

        isBadWeather = BAD_WEATHER_CODES.has(code);
        const info = WEATHER_INFO[code] ?? { label: `天気コード ${code}`, icon: '🌡️' };

        weatherIconEl.textContent = info.icon;
        weatherNameEl.textContent = info.label;
        weatherAlertBadgeEl.style.display = isBadWeather ? 'inline-block' : 'none';
        locationTextEl.textContent = `📍 ${locationName}　🕐 ${timeLabel}`;
        saveData();
    } catch {
        weatherNameEl.textContent = '天気の取得に失敗しました';
        locationTextEl.textContent = 'ネットワークを確認してください';
    }
}

// 指定した時刻(hour)の天気コードを hourly データから取得
function getWeatherCodeForHour(data, targetHour) {
    const times = data.hourly?.time ?? [];
    const codes = data.hourly?.weathercode ?? [];
    const now   = new Date();

    for (let daysAhead = 0; daysAhead <= 1; daysAhead++) {
        const d = new Date(now);
        d.setDate(d.getDate() + daysAhead);
        const yyyy = d.getFullYear();
        const mm   = String(d.getMonth() + 1).padStart(2, '0');
        const dd   = String(d.getDate()).padStart(2, '0');
        const hh   = String(targetHour).padStart(2, '0');
        const idx  = times.indexOf(`${yyyy}-${mm}-${dd}T${hh}:00`);
        if (idx < 0) continue;

        // 今日の場合：その時刻がまだ未来なら採用
        if (daysAhead === 0) {
            const targetTime = new Date(d);
            targetTime.setHours(targetHour, 0, 0, 0);
            if (targetTime > now) return codes[idx];
        } else {
            return codes[idx]; // 明日は無条件で採用
        }
    }
    return codes[0] ?? 0; // フォールバック
}

async function fetchWeather() {
    if (!savedLocation) {
        weatherNameEl.textContent = '地域が未設定です';
        locationTextEl.textContent = '「📍 変更」から都市を登録してください';
        weatherIconEl.textContent = '📍';
        return;
    }
    await fetchWeatherByCoords(savedLocation.lat, savedLocation.lon, savedLocation.name);
}

document.getElementById('refreshWeatherBtn').addEventListener('click', fetchWeather);

// ===== 位置情報検索（Nominatim / OpenStreetMap - 市・区レベル） =====

// 町・村・字・集落レベルは除外する
const EXCLUDED_TYPES = new Set([
    'town', 'village', 'hamlet', 'isolated_dwelling',
    'farm', 'allotments', 'neighbourhood', 'quarter',
]);

async function searchLocation(query) {
    locationResultsEl.innerHTML = '<div class="location-result-empty">検索中...</div>';
    try {
        const url = `https://nominatim.openstreetmap.org/search`
            + `?q=${encodeURIComponent(query)}`
            + `&format=json&accept-language=ja&limit=15&addressdetails=1`;
        const raw = await (await fetch(url, {
            headers: {
                'Accept-Language': 'ja',
                'User-Agent': 'start-app/1.0 (personal alarm clock app)',
            }
        })).json();

        // 市・区レベルのみ残す（町・村などを除外）
        const results = raw.filter(r => !EXCLUDED_TYPES.has(r.type));

        // 重複する地名を除去（同じnameの最初だけ残す）
        const seen = new Set();
        const unique = results.filter(r => {
            const { name } = formatNominatimResult(r);
            if (seen.has(name)) return false;
            seen.add(name);
            return true;
        }).slice(0, 8);

        if (!unique.length) {
            locationResultsEl.innerHTML = '<div class="location-result-empty">市・区レベルの地名が見つかりませんでした<br><small>例：横浜市、渋谷区、大阪市</small></div>';
            return;
        }

        locationResultsEl.innerHTML = unique.map((r, i) => {
            const { name, sub } = formatNominatimResult(r);
            return `<div class="location-result-item" data-index="${i}">
                <div>
                    <div class="location-result-name">📍 ${name}</div>
                    <div class="location-result-sub">${sub}</div>
                </div>
            </div>`;
        }).join('');

        locationResultsEl.querySelectorAll('.location-result-item').forEach((el, i) => {
            el.addEventListener('click', () => {
                const r = unique[i];
                const { name } = formatNominatimResult(r);
                savedLocation = {
                    name,
                    lat: parseFloat(r.lat),
                    lon: parseFloat(r.lon),
                };
                closelocationSearch();
                fetchWeather();
                showToast(`📍 ${savedLocation.name} を登録しました`);
            });
        });
    } catch {
        locationResultsEl.innerHTML = '<div class="location-result-empty">検索に失敗しました<br><small>ネットワークを確認してください</small></div>';
    }
}

function formatNominatimResult(r) {
    const a = r.address ?? {};
    // 市・区レベルの地名を優先
    let name, sub;
    if (a.city_district) {
        // 区レベル（例：渋谷区、中区）
        name = a.city_district;
        sub  = [a.city, a.state].filter(Boolean).join('　');
    } else if (a.city) {
        // 市レベル（例：横浜市、名古屋市）
        name = a.city;
        sub  = [a.state, a.country].filter(Boolean).join(' / ');
    } else if (a.county) {
        // 郡レベル（例：○○郡）
        name = a.county;
        sub  = [a.state, a.country].filter(Boolean).join(' / ');
    } else {
        name = r.display_name.split(',')[0].trim();
        sub  = r.display_name.split(',').slice(1, 3).join(',').trim();
    }
    return { name, sub };
}

function closelocationSearch() {
    locationSearchPanel.style.display = 'none';
    locationSearchInput.value = '';
    locationResultsEl.innerHTML = '';
}

document.getElementById('changeLocationBtn').addEventListener('click', () => {
    const isOpen = locationSearchPanel.style.display !== 'none';
    locationSearchPanel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) locationSearchInput.focus();
});

document.getElementById('locationSearchBtn').addEventListener('click', () => {
    const q = locationSearchInput.value.trim();
    if (!q) { showToast('都市名を入力してください'); return; }
    searchLocation(q);
});

locationSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const q = locationSearchInput.value.trim();
        if (q) searchLocation(q);
    }
});

document.getElementById('closeSearchBtn').addEventListener('click', closelocationSearch);

// ===== AudioContext 初期化（ユーザー操作中に呼ぶことでAutoplayポリシーを回避） =====
function initAudioContext() {
    if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        return audioCtx.resume();
    }
    return Promise.resolve();
}

// ===== アラーム制御 =====
function setAlarm(timeStr) {
    alarmTimeStr = timeStr;
    alarmDisplayEl.textContent = timeStr;
    alarmDisplayEl.classList.add('active');
    cancelAlarmBtnEl.style.display = 'block';
    saveData();
    showToast(`⏰ ${timeStr} にアラームをセットしました`);
    // クリック操作中にAudioContextを初期化してブラウザの制限を解除しておく
    initAudioContext().catch(() => {});
}

function cancelAlarm() {
    alarmTimeStr = null;
    alarmDisplayEl.textContent = '未設定';
    alarmDisplayEl.classList.remove('active');
    cancelAlarmBtnEl.style.display = 'none';
    saveData();
    showToast('アラームを解除しました');
}

function triggerAlarm() {
    isAlarmRinging = true;
    alarmOverlayEl.style.display = 'flex';
    updateSnoozeUI();
    startAlarmSound();
}

function snoozeAlarm() {
    if (snoozeCount >= SNOOZE_MAX) return;
    snoozeCount++;
    stopAlarmSound();
    isAlarmRinging = false;
    alarmOverlayEl.style.display = 'none';

    const snoozeAt = new Date(Date.now() + SNOOZE_MIN * 60 * 1000);
    const hh = String(snoozeAt.getHours()).padStart(2, '0');
    const mm = String(snoozeAt.getMinutes()).padStart(2, '0');
    alarmTimeStr = `${hh}:${mm}`;

    const remaining = SNOOZE_MAX - snoozeCount;
    alarmDisplayEl.textContent = `${alarmTimeStr}（スヌーズ ${snoozeCount}/${SNOOZE_MAX}）`;
    document.getElementById('snoozeStatus').style.display = 'block';
    document.getElementById('snoozeStatus').textContent =
        remaining > 0
            ? `💤 スヌーズ中 — ${alarmTimeStr} に再アラーム（残り${remaining}回）`
            : `💤 スヌーズ中 — ${alarmTimeStr} に再アラーム（これが最後）`;
    saveData();
    showToast(`💤 ${alarmTimeStr} に再アラームします（${snoozeCount}/${SNOOZE_MAX}回）`);
}

function stopAlarm() {
    isAlarmRinging = false;
    snoozeCount = 0;
    alarmOverlayEl.style.display = 'none';
    document.getElementById('snoozeStatus').style.display = 'none';
    stopAlarmSound();
    cancelAlarm();
    if (omikujiEnabled) {
        showOmikujiPanel();
    } else {
        showMemoPanel();
    }
}

// ===== おみくじパネル =====
function showOmikujiPanel() {
    const overlay     = document.getElementById('omikujiOverlay');
    const preEl       = document.getElementById('omikujiPre');
    const resultEl    = document.getElementById('omikujiResult');
    const countdownEl = document.getElementById('omikujiCountdown');

    preEl.style.display    = 'block';
    resultEl.style.display = 'none';
    overlay.style.display  = 'flex';

    let count = 10;
    countdownEl.textContent = count;

    omikujiTimer = setInterval(() => {
        count--;
        countdownEl.textContent = count;
        if (count <= 0) hideOmikujiPanel();
    }, 1000);
}

function hideOmikujiPanel() {
    clearInterval(omikujiTimer);
    omikujiTimer = null;
    document.getElementById('omikujiOverlay').style.display = 'none';
    // おみくじの後にメモを表示（メモが入力されている場合のみ）
    showMemoPanel();
}

function drawOmikuji() {
    clearInterval(omikujiTimer);
    omikujiTimer = null;

    const fortune = getDailyFortune();
    document.getElementById('fortuneEmoji').textContent  = fortune.emoji;
    const labelEl = document.getElementById('fortuneLabel');
    labelEl.textContent  = fortune.label;
    labelEl.style.color  = fortune.color;

    document.getElementById('omikujiPre').style.display    = 'none';
    document.getElementById('omikujiResult').style.display = 'block';
}

document.getElementById('omikujiBtn').addEventListener('click', drawOmikuji);
document.getElementById('fortuneCloseBtn').addEventListener('click', hideOmikujiPanel);

// ===== メモパネル =====
function showMemoPanel() {
    const memo = document.getElementById('memoInput').value.trim();
    if (!memo) return; // メモが空なら表示しない
    document.getElementById('memoDisplay').textContent = memo;
    document.getElementById('memoOverlay').style.display = 'flex';
}

function hideMemoPanel() {
    document.getElementById('memoOverlay').style.display = 'none';
}

document.getElementById('memoOkBtn').addEventListener('click', hideMemoPanel);

function updateSnoozeUI() {
    const remaining = SNOOZE_MAX - snoozeCount;
    const infoEl = document.getElementById('snoozeInfo');
    const snoozeBtn = document.getElementById('snoozeBtn');
    infoEl.textContent = remaining > 0
        ? `💤 スヌーズ あと${remaining}回（${SNOOZE_MIN}分延長）`
        : 'スヌーズは使い切りました';
    snoozeBtn.disabled = remaining <= 0;
}

document.getElementById('setRecommendedBtn').addEventListener('click', () => {
    if (!wakeupTimeStr) { showToast('まず起床時刻を計算してください'); return; }
    setAlarm(wakeupTimeStr);
});

document.getElementById('setManualBtn').addEventListener('click', () => {
    const val = document.getElementById('manualAlarmInput').value;
    if (!val) { showToast('時刻を入力してください'); return; }
    setAlarm(val);
});

document.getElementById('cancelAlarmBtn').addEventListener('click', cancelAlarm);
document.getElementById('stopAlarmBtn').addEventListener('click', stopAlarm);
document.getElementById('snoozeBtn').addEventListener('click', snoozeAlarm);
document.getElementById('calculateBtn').addEventListener('click', calculateWakeup);

document.getElementById('testSoundBtn').addEventListener('click', () => {
    initAudioContext().then(() => {
        playPattern();
        showToast('🔔 テスト音を再生しました');
    }).catch(() => showToast('音の再生に失敗しました'));
});

document.querySelectorAll('input[name="alarmSound"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        selectedSound = e.target.value;
        saveData();
    });
});

// ===== アラーム音（Web Audio API） =====

// 基本音生成（シャープ）
function beep(freq, dur, t, vol = 0.4, type = 'sine') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur);
}

// ソフト音生成（アタック付き）
function beepSoft(freq, dur, t, vol = 0.25) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur);
}

// 📣 さわやか：鳥のさえずり音
// 周波数グライド（上昇・下降）を組み合わせてさえずりを再現
function playBeep(t) {
    function chirp(f1, f2, dur, t0, vol = 0.28) {
        // 基音（グライド）
        const osc1  = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(f1, t0);
        osc1.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
        gain1.gain.setValueAtTime(0, t0);
        gain1.gain.linearRampToValueAtTime(vol, t0 + 0.012);
        gain1.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        osc1.start(t0);
        osc1.stop(t0 + dur + 0.01);

        // 倍音（より自然な音色に）
        const osc2  = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(f1 * 1.5, t0);
        osc2.frequency.exponentialRampToValueAtTime(f2 * 1.5, t0 + dur);
        gain2.gain.setValueAtTime(0, t0);
        gain2.gain.linearRampToValueAtTime(vol * 0.35, t0 + 0.012);
        gain2.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        osc2.start(t0);
        osc2.stop(t0 + dur + 0.01);
    }

    // さえずりパターン（上昇→下降を繰り返す）
    chirp(2400, 3200, 0.11, t);
    chirp(3200, 2600, 0.09, t + 0.14);
    chirp(2700, 3500, 0.12, t + 0.27);
    chirp(3500, 2700, 0.10, t + 0.42);
    chirp(2900, 3600, 0.13, t + 0.56);
    chirp(3600, 2800, 0.09, t + 0.72);
}

// 🎵 メロディ：ド・ミ・ソ・ド の上昇フレーズ
function playMelody(t) {
    beep(523,  0.20, t);        // ド (C5)
    beep(659,  0.20, t + 0.28); // ミ (E5)
    beep(784,  0.20, t + 0.56); // ソ (G5)
    beep(1047, 0.38, t + 0.84); // ド (C6)
}

// 🔔 がんばるぞ！：激しいベル音の連打
function playGentle(t) {
    // 基音＋倍音を重ねて本物のベルに近い音色を作り、4連打
    function bell(t0, vol = 0.5) {
        beep(1047, 0.6, t0, vol);           // ド (C6) 基音
        beep(1319, 0.5, t0, vol * 0.6);    // ミ (E6) 第2倍音
        beep(1568, 0.4, t0, vol * 0.4);    // ソ (G6) 第3倍音
        beep(2093, 0.3, t0, vol * 0.25);   // ド (C7) 高倍音
    }
    bell(t);
    bell(t + 0.28);
    bell(t + 0.56);
    bell(t + 0.84);
}

// 選択中の音を再生
function playPattern() {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const t = audioCtx.currentTime;
    if (selectedSound === 'melody') playMelody(t);
    else if (selectedSound === 'gentle') playGentle(t);
    else playBeep(t);
}

// サウンドの繰り返し間隔（ms）
const SOUND_INTERVAL = { beep: 2200, melody: 2200, gentle: 1400 };

function startAlarmSound() {
    initAudioContext().then(() => {
        playPattern();
        const interval = SOUND_INTERVAL[selectedSound] ?? 1500;
        alarmBeepInterval = setInterval(playPattern, interval);
    }).catch(e => console.warn('アラーム音の再生に失敗:', e));
}

function stopAlarmSound() {
    clearInterval(alarmBeepInterval);
    alarmBeepInterval = null;
    if (audioCtx) {
        audioCtx.close().catch(() => {});
        audioCtx = null;
    }
}

// ===== トースト通知 =====
let toastTimer;
function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
}

// ===== 設定の保存・復元 =====
function saveData() {
    localStorage.setItem('startapp_v1', JSON.stringify({
        trains,
        alarmTime:     alarmTimeStr,
        departureTime: document.getElementById('departureTime').value,
        prepTime:      document.getElementById('prepTime').value,
        walkTime:      document.getElementById('walkTime').value,
        weatherToggle: document.getElementById('weatherToggle').checked,
        savedLocation,
        selectedSound,
        memo:          document.getElementById('memoInput').value,
        omikujiEnabled,
    }));
}

function loadData() {
    try {
        const raw = localStorage.getItem('startapp_v1');
        if (!raw) return;
        const d = JSON.parse(raw);
        trains = d.trains || [];
        if (d.alarmTime) {
            alarmTimeStr = d.alarmTime;
            alarmDisplayEl.textContent = d.alarmTime;
            alarmDisplayEl.classList.add('active');
            cancelAlarmBtnEl.style.display = 'block';
        }
        if (d.departureTime) document.getElementById('departureTime').value = d.departureTime;
        if (d.prepTime)      document.getElementById('prepTime').value      = d.prepTime;
        if (d.walkTime)      document.getElementById('walkTime').value      = d.walkTime;
        if (d.weatherToggle !== undefined)
            document.getElementById('weatherToggle').checked = d.weatherToggle;
        if (d.savedLocation) savedLocation = d.savedLocation;
        if (d.selectedSound) {
            selectedSound = d.selectedSound;
            const radio = document.querySelector(`input[name="alarmSound"][value="${selectedSound}"]`);
            if (radio) radio.checked = true;
        }
        if (d.memo) document.getElementById('memoInput').value = d.memo;
        if (d.omikujiEnabled === false) {
            omikujiEnabled = false;
            document.getElementById('omikujiToggle').checked = false;
        }
        renderTrainList();
    } catch (e) {
        console.warn('設定の読み込みに失敗しました:', e);
    }
}

['departureTime', 'prepTime', 'walkTime'].forEach(id => {
    document.getElementById(id).addEventListener('change', saveData);
});
document.getElementById('weatherToggle').addEventListener('change', saveData);
document.getElementById('memoInput').addEventListener('input', saveData);
document.getElementById('memoClearBtn').addEventListener('click', () => {
    document.getElementById('memoInput').value = '';
    saveData();
    showToast('メモをクリアしました');
});
document.getElementById('omikujiToggle').addEventListener('change', (e) => {
    omikujiEnabled = e.target.checked;
    saveData();
});

// ===== 初期化 =====
loadData();
updateClock();
setInterval(updateClock, 1000);
fetchWeather();
