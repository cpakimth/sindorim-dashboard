// Unicode mappings for robust access
const KEY_YEAR = '\ub144';
const KEY_APT = '\uc544\ud30c\ud2b8';
const KEY_DONG = '\ubc95\uc815\ub3d9';
const KEY_AREA = '\uc804\uc6a9\uba74\uc801';
const KEY_DATE = '\ub0a0\uc9dc';
const KEY_PRICE = '\uac70\ub798\uae08\uc561';
const KEY_FLOOR = '\uce35';
const KEY_BUILD_YEAR = '\uac74\ucd95\ub144\ub3c4';

let myChart = null;

const KEY_LAT = 'lat';
const KEY_LNG = 'lng';

let map = null;
let markers = [];
let infowindow = null;

// Ensure data is loaded
if (typeof transactionData === 'undefined') {
    console.error("Data failed to load! Ensure data.js is generated and loaded.");
    document.getElementById('statCount').innerText = "ERROR";
} else {
    initDashboard();
}

function initDashboard() {
    const years = new Set();
    const dongs = new Set();
    const areas = new Set();
    
    transactionData.forEach(item => {
        if (item[KEY_YEAR]) years.add(item[KEY_YEAR]);
        if (item[KEY_DONG]) dongs.add(item[KEY_DONG]);
        if (item[KEY_AREA]) areas.add(item[KEY_AREA]);
    });
    
    const dongSelect = document.getElementById('dongSelect');
    [...dongs].sort().forEach(d => {
        const option = document.createElement('option');
        option.value = d;
        option.textContent = d;
        dongSelect.appendChild(option);
    });

    const yearSelect = document.getElementById('yearSelect');
    [...years].sort((a,b) => b-a).forEach(y => {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = `${y}\ub144`; // '년'
        yearSelect.appendChild(option);
    });

    populateAptSelect('all');

    const areaSelect = document.getElementById('areaSelect');
    [...areas].sort((a,b) => a-b).forEach(a => {
        const option = document.createElement('option');
        option.value = a;
        option.textContent = `${a} \u33A1`; // sqm symbol
        areaSelect.appendChild(option);
    });
    
    dongSelect.addEventListener('change', () => {
        populateAptSelect(dongSelect.value);
        drawMapMarkers();
        updateDashboard();
    });
    yearSelect.addEventListener('change', updateDashboard);
    aptSelect.addEventListener('change', updateDashboard);
    areaSelect.addEventListener('change', updateDashboard);
    
    // Initialize Map
    if (typeof kakao !== 'undefined' && kakao.maps) {
        kakao.maps.load(() => {
            const mapContainer = document.getElementById('map');
            const mapOption = { 
                center: new kakao.maps.LatLng(37.509, 126.883), // Sindorim default
                level: 5
            };
            map = new kakao.maps.Map(mapContainer, mapOption);
            infowindow = new kakao.maps.InfoWindow({zIndex:1});
            
            drawMapMarkers();
        });
    }

    updateDashboard();
}

function populateAptSelect(selectedDong) {
    const aptSelect = document.getElementById('aptSelect');
    aptSelect.innerHTML = '<option value="all">전체 단지</option>';
    
    const apts = new Set();
    transactionData.forEach(item => {
        if (selectedDong === 'all' || item[KEY_DONG] === selectedDong) {
            if (item[KEY_APT]) apts.add(item[KEY_APT]);
        }
    });
    
    [...apts].sort().forEach(apt => {
        const option = document.createElement('option');
        option.value = apt;
        option.textContent = apt;
        aptSelect.appendChild(option);
    });
}

function drawMapMarkers() {
    if (!map) return;
    
    markers.forEach(m => m.setMap(null));
    markers = [];
    
    // Check if dong selector exists yet
    const dongSelectEl = document.getElementById('dongSelect');
    const selectedDong = dongSelectEl ? dongSelectEl.value : 'all';
    
    const aptMap = new Map();
    transactionData.forEach(item => {
        if (selectedDong !== 'all' && item[KEY_DONG] !== selectedDong) return;
        
        const aptName = item[KEY_APT];
        const lat = item[KEY_LAT];
        const lng = item[KEY_LNG];
        
        if (lat && lng && !aptMap.has(aptName)) {
            aptMap.set(aptName, { lat, lng });
        }
    });

    aptMap.forEach((coords, aptName) => {
        const markerPosition = new kakao.maps.LatLng(coords.lat, coords.lng); 

        let isUndervalued = false;
        
        // Simple valuation logic for map indicator
        if (typeof avmPredictions !== 'undefined' && avmPredictions[aptName]) {
            const areas = Object.keys(avmPredictions[aptName]);
            if (areas.length > 0) {
                const testArea = areas[0];
                const aiPrice = avmPredictions[aptName][testArea];
                const latestTx = transactionData.filter(i => i[KEY_APT] === aptName && String(i[KEY_AREA]) === testArea).sort((a,b) => new Date(b[KEY_DATE]) - new Date(a[KEY_DATE]))[0];
                if (latestTx && latestTx[KEY_PRICE] < aiPrice * 0.95) {
                    isUndervalued = true; // Market price is 5%+ cheaper than AI fair value
                }
            }
        }

        const markerOptions = { position: markerPosition, title: aptName };
        if (isUndervalued) {
            const imageSrc = "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png"; 
            markerOptions.image = new kakao.maps.MarkerImage(imageSrc, new kakao.maps.Size(24, 35));
        }

        const marker = new kakao.maps.Marker(markerOptions);
        marker.setMap(map);
        markers.push(marker);

        kakao.maps.event.addListener(marker, 'click', function() {
            document.getElementById('areaSelect').value = 'all';
            document.getElementById('aptSelect').value = aptName;
            updateDashboard();
            
            let infoHtml = `<div style="padding:5px;font-size:12px;color:#000;font-weight:bold;">${aptName}</div>`;
            if (isUndervalued) infoHtml += `<div style="padding:0 5px 5px 5px;font-size:11px;color:green;">⭐ AI 저평가 단지</div>`;
            
            infowindow.setContent(infoHtml);
            infowindow.open(map, marker);
        });
    });
}

function updateDashboard() {
    const selectedDong = document.getElementById('dongSelect') ? document.getElementById('dongSelect').value : 'all';
    const selectedYear = document.getElementById('yearSelect').value;
    const selectedApt = document.getElementById('aptSelect').value;
    const areaSelect = document.getElementById('areaSelect');
    const selectedArea = areaSelect.value;
    
    // Auto-select area if an apartment is chosen and only has one size
    if (selectedApt !== 'all' && document.getElementById('areaSelect').value === 'all') { const selectedArea = areaSelect.value; }
    
    let preFiltered = transactionData.filter(item => {
        let matchYear = selectedYear === 'all' || String(item[KEY_YEAR]) === selectedYear;
        let matchDong = selectedDong === 'all' || item[KEY_DONG] === selectedDong;
        let matchApt = selectedApt === 'all' || item[KEY_APT] === selectedApt;
        return matchYear && matchDong && matchApt;
    });
    
    const validAreas = new Set();
    preFiltered.forEach(item => validAreas.add(item[KEY_AREA]));
    
    areaSelect.innerHTML = '<option value="all">All Sizes</option>';
    [...validAreas].sort((a,b) => a-b).forEach(a => {
        const option = document.createElement('option');
        option.value = a;
        option.textContent = `${a} \u33A1`;
        areaSelect.appendChild(option);
    });
    
    if (selectedArea === 'all' || [...validAreas].map(String).includes(selectedArea)) {
        areaSelect.value = selectedArea;
    } else {
        areaSelect.value = 'all';
    }
    
    const finalSelectedArea = areaSelect.value;
    
    let filtered = preFiltered.filter(item => {
        const yearMatch = selectedYear === 'all' || String(item[KEY_YEAR]) === selectedYear;
        const dongMatch = selectedDong === 'all' || item[KEY_DONG] === selectedDong;
        const aptMatch = selectedApt === 'all' || item[KEY_APT] === selectedApt;
        const areaMatch = finalSelectedArea === 'all' || String(item[KEY_AREA]) === finalSelectedArea;
        
        return yearMatch && dongMatch && aptMatch && areaMatch;
    });
    
    filtered.sort((a,b) => new Date(a[KEY_DATE]) - new Date(b[KEY_DATE]));
    
    document.getElementById('statCount').innerText = filtered.length;
    
    if(filtered.length > 0) {
        const sum = filtered.reduce((acc, curr) => acc + curr[KEY_PRICE], 0);
        const avg = Math.round(sum / filtered.length);
        const max = Math.max(...filtered.map(i => i[KEY_PRICE]));
        
        document.getElementById('statAvg').innerText = avg.toLocaleString() + ' 만원';
        document.getElementById('statMax').innerText = max.toLocaleString() + ' 만원';
        
        // AI Prediction Handling
        const statAICard = document.getElementById('statAI');
        if (typeof avmPredictions !== 'undefined' && selectedApt !== 'all' && finalSelectedArea !== 'all') {
            if (avmPredictions[selectedApt] && avmPredictions[selectedApt][finalSelectedArea]) {
                const pred = avmPredictions[selectedApt][finalSelectedArea];
                
                // Compare with latest actual transaction in the filtered data
                const actual = [...filtered].sort((a,b) => new Date(b[KEY_DATE]) - new Date(a[KEY_DATE]))[0][KEY_PRICE];
                const ratio = ((actual - pred) / pred) * 100;
                
                let diffText = "";
                let diffColor = "#94a3b8";
                
                if (ratio < -3) {
                    diffText = `(▼ 실거래가 ${Math.abs(ratio).toFixed(1)}% 저평가)`;
                    diffColor = "#4ade80"; // green
                } else if (ratio > 3) {
                    diffText = `(▲ 실거래가 ${Math.abs(ratio).toFixed(1)}% 고평가)`;
                    diffColor = "#f87171"; // red
                } else {
                    diffText = `(- 적정 시세)`;
                }
                
                statAICard.innerHTML = `${pred.toLocaleString()} 만원<br><span style="font-size:0.9rem;color:${diffColor};">${diffText}</span>`;
            } else {
                statAICard.innerText = "데이터 부족";
            }
        } else if (selectedApt === 'all' || finalSelectedArea === 'all') {
            statAICard.innerHTML = '<span style="font-size: 1.1rem; font-weight: 500; text-shadow: none;">단지 및 면적 선택 시 표시</span>';
        } else {
            statAICard.innerText = "N/A";
        }

    } else {
        document.getElementById('statAvg').innerText = "0 만원";
        document.getElementById('statMax').innerText = "0 만원";
        document.getElementById('statAI').innerText = "N/A";
    }
    
    const monthlyGroups = {};
    filtered.forEach(item => {
        if(!monthlyGroups[item[KEY_DATE]]) monthlyGroups[item[KEY_DATE]] = { sum: 0, count: 0 };
        monthlyGroups[item[KEY_DATE]].sum += item[KEY_PRICE];
        monthlyGroups[item[KEY_DATE]].count += 1;
    });
    
    const labels = Object.keys(monthlyGroups).sort((a,b) => new Date(a) - new Date(b));
    const dataPoints = labels.map(l => Math.round(monthlyGroups[l].sum / monthlyGroups[l].count));
    
    renderChart(labels, dataPoints, selectedYear, selectedApt, finalSelectedArea);
    
    const tbody = document.getElementById('historyBody');
    tbody.innerHTML = '';
    
    const tableData = [...filtered].reverse();
    
    tableData.forEach(item => {
        const tr = document.createElement('tr');
        
        const tdDate = document.createElement('td');
        tdDate.textContent = item[KEY_DATE];
        
        const tdDong = document.createElement('td');
        tdDong.textContent = item[KEY_DONG];
        
        const tdApt = document.createElement('td');
        tdApt.textContent = item[KEY_APT];
        
        const tdArea = document.createElement('td');
        tdArea.textContent = item[KEY_AREA];
        
        const tdFloor = document.createElement('td');
        tdFloor.textContent = item[KEY_FLOOR];
        
        const tdYear = document.createElement('td');
        tdYear.textContent = item[KEY_BUILD_YEAR];
        
        const tdPrice = document.createElement('td');
        tdPrice.textContent = item[KEY_PRICE].toLocaleString() + ' 만원';
        tdPrice.style.fontWeight = '600';
        tdPrice.style.color = '#e0e7ff';
        
        tr.appendChild(tdDate);
        tr.appendChild(tdDong);
        tr.appendChild(tdApt);
        tr.appendChild(tdArea);
        tr.appendChild(tdFloor);
        tr.appendChild(tdYear);
        tr.appendChild(tdPrice);
        
        tbody.appendChild(tr);
    });
}

function renderChart(labels, data, yearLabel, aptLabel, areaLabel) {
    const ctx = document.getElementById('priceChart').getContext('2d');
    
    if (myChart) {
        myChart.destroy();
    }
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.6)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    let dsLabel = "평균 거래가 추이";
    if (aptLabel !== 'all') dsLabel = `${aptLabel} 추이`;
    if (areaLabel !== 'all') dsLabel += ` (${areaLabel}\u33A1)`;
    if (yearLabel !== 'all') dsLabel += ` [${yearLabel}년]`;

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: dsLabel,
                data: data,
                borderColor: '#60a5fa',
                backgroundColor: gradient,
                borderWidth: 3,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#60a5fa',
                pointHoverBackgroundColor: '#60a5fa',
                pointHoverBorderColor: '#fff',
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index',
            },
            plugins: {
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#cbd5e1',
                    bodyColor: '#f8fafc',
                    bodyFont: { size: 14, weight: 'bold' },
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return context.parsed.y.toLocaleString() + ' \ub9cc\uc6d0'; // '만원'
                        }
                    }
                },
                legend: {
                    labels: { color: '#e2e8f0', font: { family: 'Outfit', size: 14 } }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
                    ticks: {
                        color: '#94a3b8',
                        font: { family: 'Outfit' },
                        callback: function(value) {
                            return value.toLocaleString() + ' \ub9cc\uc6d0';
                        }
                    }
                }
            }
        }
    });
}
