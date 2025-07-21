// js/oscilloscope.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Elementy DOM ---
    const fileInput = document.getElementById('file-input');
    const statusDiv = document.getElementById('status');
    const separatorInfo = document.getElementById('separator-info');
    const canvas = document.getElementById('plot-canvas');
    const cursorsBtn = document.getElementById('cursors-toggle-btn');
    const autoMeasureBtn = document.getElementById('auto-measure-toggle-btn');
    const fftBtn = document.getElementById('fft-toggle-btn');
    const resetViewBtn = document.getElementById('reset-view-btn');
    const optimizationSlider = document.getElementById('optimization-slider');
    const measurementsPanel = document.getElementById('measurements-panel');
    const autoMeasurementsPanel = document.getElementById('auto-measurements-panel');
    const densityInfo = document.getElementById('density-info');
    const sliderControl = document.querySelector('.slider-control');
    const fftControls = document.getElementById('fft-controls');
    const fftFreqInput = document.getElementById('fft-freq-input');
    const fftUnitSelect = document.getElementById('fft-unit-select');
    const fftPeaksToggleBtn = document.getElementById('fft-peaks-toggle-btn');
    const fftPeaksControls = document.getElementById('fft-peaks-controls');
    const fftPeaksInput = document.getElementById('fft-peaks-input');
    const fftPeaksPanel = document.getElementById('fft-peaks-panel');
    const tooltipPanel = document.getElementById('tooltip-panel');
    const hintPanel = document.getElementById('hint-panel');
    const hintPanelClose = document.getElementById('hint-panel-close');

    // --- Globalne zmienne ---
    let allVoltages = [];
    let startTime = 0;
    let increment = 1e-9;
    let dataMinY = 0, dataMaxY = 0;
    let renderMode = 'minmax';
    let optimizationLevel = 25;
    
    const chart = new ChartPlotter(canvas, {
        padding: { top: 20, right: 20, bottom: 40, left: 60 },
        onDrawStats: (stats) => {
            if (fftMode.enabled) {
                densityInfo.textContent = ''; // No density info in FFT mode
                return;
            }
            if (!stats) {
                densityInfo.textContent = '';
                return;
            }
            if (stats.mode === 'minmax') {
                densityInfo.textContent = 'Auto';
            } else {
                densityInfo.textContent = `${stats.displayed.toLocaleString('pl-PL')} / ${stats.total.toLocaleString('pl-PL')}`;
            }
        }
    });
    
    // --- Stan narzędzi ---
    const cursors = { enabled: false, v1: 0.75, v2: 0.25, t1: 0.25, t2: 0.75, dragging: null, hovering: null, grabDistance: 10 };
    const autoMeasurements = { enabled: false };
    const fftMode = { enabled: false, data: null, effectiveIncrement: 1, minY: 0, maxY: 0 };
    const fftPeaks = { enabled: false, data: [], num: 5 };

    // --- Inicjalizacja ---
    function init() {
        fileInput.addEventListener('change', handleFileSelect);
        
        document.querySelectorAll('input[name="renderMode"]').forEach(radio => {
            radio.addEventListener('change', function() { 
                renderMode = this.value; 
                sliderControl.style.display = renderMode === 'minmax' ? 'none' : 'flex';
                chart.setRenderOptions({ mode: renderMode });
            });
        });
        
        cursorsBtn.addEventListener('click', toggleCursors);
        autoMeasureBtn.addEventListener('click', toggleAutoMeasurements);
        fftBtn.addEventListener('click', toggleFFT);
        fftPeaksToggleBtn.addEventListener('click', toggleFFTPeaks);
        fftPeaksInput.addEventListener('change', (e) => {
            fftPeaks.num = parseInt(e.target.value, 10);
            if (fftPeaks.enabled) {
                findFFTPeaks();
                draw();
            }
        });

        resetViewBtn.addEventListener('click', () => chart.resetView());
        optimizationSlider.addEventListener('input', (e) => {
            optimizationLevel = parseInt(e.target.value, 10);
            chart.setRenderOptions({ level: optimizationLevel });
        });
        
        const fftUpdateHandler = () => {
            if(fftMode.enabled) {
                calculateFFT();
                updateChart();
            }
        };
        fftFreqInput.addEventListener('change', fftUpdateHandler);
        fftUnitSelect.addEventListener('change', fftUpdateHandler);
        
        hintPanelClose.addEventListener('click', () => hintPanel.style.display = 'none');

        // Tooltip logic
        canvas.addEventListener('mousemove', (e) => {
            const { chartWidth, chartHeight } = chart.getDimensions();
            const mouseX_chart = e.offsetX - chart.padding.left;
            const mouseY_chart = e.offsetY - chart.padding.top;

            if (mouseX_chart >= 0 && mouseX_chart <= chartWidth && mouseY_chart >= 0 && mouseY_chart <= chartHeight) {
                tooltipPanel.style.display = 'block';
                tooltipPanel.style.left = `${e.clientX + 15}px`;
                tooltipPanel.style.top = `${e.clientY + 15}px`;
                if (fftMode.enabled) {
                    const freq = (mouseX_chart - chart.view.offsetX) / chart.view.scaleX;
                    const db = (mouseY_chart - chart.view.offsetY) / chart.view.scaleY;
                    tooltipPanel.innerHTML = `${formatValue(freq, 'Hz')}<br>${db.toFixed(2)} dB`;
                } else {
                    const time = (mouseX_chart - chart.view.offsetX) / chart.view.scaleX;
                    const voltage = (mouseY_chart - chart.view.offsetY) / chart.view.scaleY;
                    tooltipPanel.innerHTML = `${formatValue(time, 's')}<br>${formatValue(voltage, 'V')}`;
                }
            } else {
                tooltipPanel.style.display = 'none';
            }
        });
        canvas.addEventListener('mouseleave', () => {
            tooltipPanel.style.display = 'none';
        });
        
        sliderControl.style.display = renderMode === 'minmax' ? 'none' : 'flex';
        updateChart();
    }

    // --- Obsługa Plików ---
    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        statusDiv.textContent = '⏳ Wczytywanie pliku...';
        separatorInfo.textContent = '';
        const reader = new FileReader();
        reader.onload = e => {
            statusDiv.textContent = '⚙️ Przetwarzanie danych... To może potrwać...';
            setTimeout(() => {
                try {
                    parseData(e.target.result);
                    updateChart();
                    statusDiv.textContent = `✅ Gotowe! Użyj kółka myszy do zoomu, przeciągnij by przesuwać.`
                } catch (error) {
                    statusDiv.textContent = `❌ Błąd: ${error.message}`;
                    separatorInfo.textContent = 'Sprawdź format pliku lub konsolę (F12).';
                    console.error(error);
                }
            }, 50);
        };
        reader.readAsText(file);
    }

    function parseData(content) {
        const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 3) throw new Error("Plik jest zbyt krótki lub ma nieprawidłowy format.");
        let columnSeparator = ';', decimalSeparator = ',';
        const headerLine2 = lines[1];
        if (headerLine2.split(';').length >= 3) {
            columnSeparator = ';';
            decimalSeparator = headerLine2.split(';')[1].includes(',') ? ',' : '.';
        } else if (headerLine2.split(',').length >= 3) {
            columnSeparator = ',';
            decimalSeparator = '.';
        } else { throw new Error("Nie udało się automatycznie wykryć separatora kolumn."); }
        separatorInfo.textContent = `Separatory: Kolumna="${columnSeparator}" Dziesiętny="${decimalSeparator}"`;
        const parseNumber = (str) => parseFloat(str?.trim().replace(decimalSeparator, '.'));
        const metaLineParts = lines[1].trim().split(columnSeparator);
        startTime = parseNumber(metaLineParts[1]);
        increment = parseNumber(metaLineParts[2]);
        if (isNaN(startTime) || isNaN(increment)) throw new Error("Nie udało się odczytać metadanych.");
        allVoltages = new Float32Array(lines.length - 2);
        let count = 0;
        dataMinY = Infinity; dataMaxY = -Infinity;
        for (let i = 2; i < lines.length; i++) {
            const valueStr = lines[i].trim().split(columnSeparator)[0];
            if (valueStr) {
                const v = parseNumber(valueStr);
                if (!isNaN(v)) {
                    allVoltages[count++] = v;
                    if (v < dataMinY) dataMinY = v;
                    if (v > dataMaxY) dataMaxY = v;
                }
            }
        }
        allVoltages = allVoltages.slice(0, count);
        if (allVoltages.length === 0) throw new Error("Nie znaleziono żadnych prawidłowych danych.");
    }
    
    // --- Główna funkcja aktualizująca ---
    function updateChart() {
        if (fftMode.enabled) {
            const freqFit = getBestFreqFit(chart.getDimensions().chartWidth / chart.view.scaleX);
            const axisFormatters = {
                x: (f) => (f * freqFit.multiplier).toFixed(2).replace(/\.00$/, ''),
                y: (db) => db.toFixed(0),
                xLabel: `Częstotliwość [${freqFit.unit}]`,
                yLabel: 'Amplituda [dB]'
            };
            chart.setData({
                type: 'fft',
                points: fftMode.data,
                startTime: 0,
                increment: fftMode.nyquist / fftMode.data.length,
                minY: fftMode.minY,
                maxY: fftMode.maxY,
                nyquist: fftMode.nyquist,
            }, {
                mode: 'line', // FFT is always a line
                color: '#33ff99'
            }, axisFormatters);
        } else {
            const timeFit = getBestTimeFit(chart.getDimensions().chartWidth / chart.view.scaleX);
            const axisFormatters = {
                x: (t) => {
                    // Re-calculate timeFit inside the formatter to ensure it's always up-to-date
                    const currentFit = getBestTimeFit(chart.getDimensions().chartWidth / chart.view.scaleX);
                    return (t * currentFit.multiplier).toFixed(2).replace(/\.00$/, '');
                },
                y: (v) => v.toFixed(2),
                xLabel: `Czas [${timeFit.unit}]`,
                yLabel: 'Napięcie [V]'
            };
            chart.setData({
                type: 'time',
                points: allVoltages,
                startTime: startTime,
                increment: increment,
                minY: dataMinY,
                maxY: dataMaxY,
            }, {
                mode: renderMode,
                level: optimizationLevel,
                color: '#33ff99'
            }, axisFormatters);
        }
        draw(); // Redraw overlays
    }

    function draw() {
        chart.draw(); // The main chart plotter does its job
        
        // Now, draw overlays specific to oscilloscope
        const dimensions = chart.getDimensions();
        if (cursors.enabled && !fftMode.enabled) {
            drawCursors(dimensions);
            updateMeasurementsPanel(dimensions);
        }
        if (autoMeasurements.enabled && !fftMode.enabled) updateAutoMeasurementsPanel();
        if (fftPeaks.enabled) {
            drawFFTPeaks(dimensions);
            updateFFTPeaksPanel();
        }
    }

    // --- Logika Kursorów ---
    function toggleCursors() {
        cursors.enabled = !cursors.enabled;
        cursorsBtn.classList.toggle('active', cursors.enabled);
        measurementsPanel.style.display = cursors.enabled ? 'block' : 'none';
        draw();
    }
    function drawCursors({ chartWidth, chartHeight }) {
        const ctx = chart.ctx;
        ctx.save();
        ctx.translate(chart.padding.left, chart.padding.top);
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#ffa500'; // Czas
        const x1 = cursors.t1 * chartWidth;
        const x2 = cursors.t2 * chartWidth;
        ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, chartHeight); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2, 0); ctx.lineTo(x2, chartHeight); ctx.stroke();
        ctx.strokeStyle = '#9370db'; // Napięcie
        const y1 = cursors.v1 * chartHeight;
        const y2 = cursors.v2 * chartHeight;
        ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(chartWidth, y1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, y2); ctx.lineTo(chartWidth, y2); ctx.stroke();
        ctx.restore();
    }
    function updateMeasurementsPanel({ chartWidth, chartHeight }) {
        const t1_val = (cursors.t1 * chartWidth - chart.view.offsetX) / chart.view.scaleX;
        const t2_val = (cursors.t2 * chartWidth - chart.view.offsetX) / chart.view.scaleX;
        const v1_val = (cursors.v1 * chartHeight - chart.view.offsetY) / chart.view.scaleY;
        const v2_val = (cursors.v2 * chartHeight - chart.view.offsetY) / chart.view.scaleY;
        const deltaT = Math.abs(t1_val - t2_val);
        const deltaV = Math.abs(v1_val - v2_val);
        const frequency = deltaT > 0 ? 1 / deltaT : 0;
        measurementsPanel.innerHTML = `
            ΔV: ${formatValue(deltaV, 'V')}<br>
            Δt: ${formatValue(deltaT, 's')}<br>
            ƒ: ${formatValue(frequency, 'Hz')}
        `;
    }

    // --- Logika Pomiarów Automatycznych ---
    function getBestTimeFit(range) {
        const absRange = Math.abs(range);
        if (absRange >= 1) return { multiplier: 1, unit: 's' };
        if (absRange >= 1e-3) return { multiplier: 1e3, unit: 'ms' };
        if (absRange >= 1e-6) return { multiplier: 1e6, unit: 'µs' };
        if (absRange >= 1e-9) return { multiplier: 1e9, unit: 'ns' };
        return { multiplier: 1e12, unit: 'ps' };
    }
    function toggleAutoMeasurements() {
        autoMeasurements.enabled = !autoMeasurements.enabled;
        autoMeasureBtn.classList.toggle('active', autoMeasurements.enabled);
        autoMeasurementsPanel.style.display = autoMeasurements.enabled ? 'block' : 'none';
        draw();
    }
    function getVisibleAndOptimizedData() {
        const { chartWidth } = chart.getDimensions();
        const startIndex = Math.max(0, Math.floor((-chart.view.offsetX / chart.view.scaleX - startTime) / increment));
        const endIndex = Math.min(allVoltages.length, Math.ceil(((chartWidth - chart.view.offsetX) / chart.view.scaleX - startTime) / increment));
        
        const originalData = allVoltages.slice(startIndex, endIndex);
        if (originalData.length < 2) {
            return { processedData: [], effectiveIncrement: increment };
        }

        if (renderMode === 'minmax') {
            const MAX_SAMPLES_FOR_ANALYSIS = 10000;
            if (originalData.length > MAX_SAMPLES_FOR_ANALYSIS) {
                const step = Math.floor(originalData.length / MAX_SAMPLES_FOR_ANALYSIS);
                const processedData = originalData.filter((_, i) => i % step === 0);
                return { processedData, effectiveIncrement: increment * step };
            }
            return { processedData: originalData, effectiveIncrement: increment };
        } else {
            const pointsInView = originalData.length;
            const baseDensity = chartWidth * 2;
            const maxDensity = pointsInView;
            const density = baseDensity + (maxDensity - baseDensity) * ((optimizationLevel - 1) / 99);
            const step = Math.max(1, Math.floor(pointsInView / density));
            const processedData = originalData.filter((_, i) => i % step === 0);
            return { processedData, effectiveIncrement: increment * step };
        }
    }

    function updateAutoMeasurementsPanel() {
        const { processedData, effectiveIncrement } = getVisibleAndOptimizedData();

        if (processedData.length < 2) {
            autoMeasurementsPanel.innerHTML = 'Zbyt mało danych';
            return;
        }

        // --- Basic measurements ---
        let min = processedData[0], max = processedData[0], sum = 0, sumSq = 0;
        for (const v of processedData) {
            if (v < min) min = v;
            if (v > max) max = v;
            sum += v;
            sumSq += v * v;
        }
        const avg = sum / processedData.length;
        const rms = Math.sqrt(sumSq / processedData.length);
        const vpp = max - min;

        // --- Frequency/Period measurements ---
        const highThreshold = avg + vpp * 0.2;
        const lowThreshold = avg - vpp * 0.2;
        let state = 'looking_for_high';
        const periods = [];
        let lastUpCrossingIndex = -1;

        for (let i = 1; i < processedData.length; i++) {
            const prev_v = processedData[i-1];
            const curr_v = processedData[i];
            if (state === 'looking_for_high' && prev_v < highThreshold && curr_v >= highThreshold) {
                if (lastUpCrossingIndex !== -1) {
                    const periodInSamples = i - lastUpCrossingIndex;
                    periods.push(periodInSamples * effectiveIncrement);
                }
                lastUpCrossingIndex = i;
                state = 'looking_for_low';
            } else if (state === 'looking_for_low' && prev_v > lowThreshold && curr_v <= lowThreshold) {
                state = 'looking_for_high';
            }
        }
        
        let avgPeriod = null;
        if (periods.length > 0) {
            avgPeriod = periods.reduce((a, b) => a + b, 0) / periods.length;
        }
        const frequency = avgPeriod ? 1 / avgPeriod : null;
        
        autoMeasurementsPanel.innerHTML = `
            Vpp: ${formatValue(vpp, 'V')}<br>
            Vmax: ${formatValue(max, 'V')}<br>
            Vmin: ${formatValue(min, 'V')}<br>
            Vavg: ${formatValue(avg, 'V')}<br>
            Vrms: ${formatValue(rms, 'V')}<br>
            Okres: ${formatValue(avgPeriod, 's')}<br>
            ƒ: ${formatValue(frequency, 'Hz')}
        `;
    }

    // --- Logika FFT ---
    function getBestFreqFit(range) {
        const absRange = Math.abs(range);
        if (absRange >= 1e9) return { multiplier: 1e-9, unit: 'GHz' };
        if (absRange >= 1e6) return { multiplier: 1e-6, unit: 'MHz' };
        if (absRange >= 1e3) return { multiplier: 1e-3, unit: 'kHz' };
        return { multiplier: 1, unit: 'Hz' };
    }
    function toggleFFT() {
        fftMode.enabled = !fftMode.enabled;
        fftBtn.classList.toggle('active', fftMode.enabled);
        fftControls.style.display = fftMode.enabled ? 'flex' : 'none';
        if (fftMode.enabled) {
            if (cursors.enabled) toggleCursors();
            if (autoMeasurements.enabled) toggleAutoMeasurements();
            cursorsBtn.disabled = true;
            autoMeasureBtn.disabled = true;
            calculateFFT();
        } else {
            cursorsBtn.disabled = false;
            autoMeasureBtn.disabled = false;
            if (fftPeaks.enabled) toggleFFTPeaks();
            fftPeaksPanel.style.display = 'none';
        }
        updateChart();
    }

    function toggleFFTPeaks() {
        fftPeaks.enabled = !fftPeaks.enabled;
        fftPeaksToggleBtn.classList.toggle('active', fftPeaks.enabled);
        fftPeaksControls.style.display = fftPeaks.enabled ? 'flex' : 'none';
        fftPeaksPanel.style.display = fftPeaks.enabled ? 'block' : 'none';
        if (fftPeaks.enabled) {
            findFFTPeaks();
        }
        draw();
    }

    function findFFTPeaks() {
        if (!fftMode.data) {
            fftPeaks.data = [];
            return;
        }
        const magnitudes = fftMode.data;
        const allPeaks = [];
        for (let i = 1; i < magnitudes.length - 1; i++) {
            if (magnitudes[i] > magnitudes[i - 1] && magnitudes[i] > magnitudes[i + 1]) {
                allPeaks.push({ index: i, magnitude: magnitudes[i] });
            }
        }
        allPeaks.sort((a, b) => b.magnitude - a.magnitude);
        fftPeaks.data = allPeaks.slice(0, fftPeaks.num);
    }
    
    function drawFFTPeaks({ chartWidth, chartHeight }) {
        if (!fftPeaks.enabled || fftPeaks.data.length === 0) return;
        
        const ctx = chart.ctx;
        const freqStep = fftMode.nyquist / fftMode.data.length;

        ctx.save();
        ctx.translate(chart.padding.left, chart.padding.top);
        ctx.fillStyle = '#ff4444';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        fftPeaks.data.forEach(peak => {
            const freq = peak.index * freqStep;
            const x = freq * chart.view.scaleX + chart.view.offsetX;
            const y = peak.magnitude * chart.view.scaleY + chart.view.offsetY;

            if (x > 0 && x < chartWidth && y > 0 && y < chartHeight) {
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillText(formatValue(freq, 'Hz'), x, y - 5);
            }
        });
        ctx.restore();
    }

    function updateFFTPeaksPanel() {
        if (!fftPeaks.enabled || fftPeaks.data.length === 0) {
            fftPeaksPanel.style.display = 'none';
            return;
        }
        fftPeaksPanel.style.display = 'block';
        const freqStep = fftMode.nyquist / fftMode.data.length;
        let html = '<b>Wykryte piki:</b><br>';
        fftPeaks.data.forEach(peak => {
            const freq = peak.index * freqStep;
            html += `${formatValue(freq, 'Hz')}: ${peak.magnitude.toFixed(2)} dB<br>`;
        });
        fftPeaksPanel.innerHTML = html;
    }

    function calculateFFT() {
        const { processedData, effectiveIncrement } = getVisibleAndOptimizedData();
        
        if (processedData.length < 2) {
            fftMode.data = null;
            return;
        }
        
        fftMode.effectiveIncrement = effectiveIncrement;
        const samples = processedData;

        for(let i=0; i < samples.length; i++) {
            samples[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / (samples.length - 1)));
        }

        const N = 1 << Math.ceil(Math.log2(samples.length));
        const real = new Float32Array(N);
        const imag = new Float32Array(N);
        real.set(samples);

        // Standard Cooley-Tukey FFT
        let j = 0;
        for (let i = 0; i < N; i++) {
            if (i < j) { [real[i], real[j]] = [real[j], real[i]]; }
            let m = N >> 1;
            while (j >= m && m > 0) { j -= m; m >>= 1; }
            j += m;
        }
        for (let L = 2; L <= N; L <<= 1) {
            const M = L >> 1;
            const sr = Math.cos(Math.PI / M);
            const si = -Math.sin(Math.PI / M);
            let wr = 1, wi = 0;
            for (j = 0; j < M; j++) {
                for (let i = j; i < N; i += L) {
                    const k = i + M;
                    const tr = wr * real[k] - wi * imag[k];
                    const ti = wr * imag[k] + wi * real[k];
                    real[k] = real[i] - tr;
                    imag[k] = imag[i] - ti;
                    real[i] += tr;
                    imag[i] += ti;
                }
                [wr, wi] = [wr * sr - wi * si, wr * si + wi * sr];
            }
        }

        const magnitudes = new Float32Array(N / 2);
        let minDb = Infinity, maxDb = -Infinity;
        for (let i = 0; i < N / 2; i++) {
            const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / N;
            const db = 20 * Math.log10(mag);
            magnitudes[i] = db;
            if (isFinite(db)) {
                if (db < minDb) minDb = db;
                if (db > maxDb) maxDb = db;
            }
        }
        fftMode.data = magnitudes;
        fftMode.minY = minDb === Infinity ? -100 : minDb;
        fftMode.maxY = maxDb === -Infinity ? 0 : maxDb;
        fftMode.nyquist = (1 / fftMode.effectiveIncrement) / 2;

        if (fftPeaks.enabled) {
            findFFTPeaks();
        }
    }
    
    // Helper for tooltip
    function formatValue(value, unit) {
        if (value === null || isNaN(value)) return '---';
        if (Math.abs(value) >= 1e9) return (value / 1e9).toFixed(2) + ' G' + unit;
        if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(2) + ' M' + unit;
        if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(2) + ' k' + unit;
        if (Math.abs(value) >= 1) return value.toFixed(2) + ' ' + unit;
        if (Math.abs(value) >= 1e-3) return (value * 1e3).toFixed(2) + ' m' + unit;
        if (Math.abs(value) >= 1e-6) return (value * 1e6).toFixed(2) + ' µ' + unit;
        if (Math.abs(value) >= 1e-9) return (value * 1e9).toFixed(2) + ' n' + unit;
        if (value === 0) return '0 ' + unit;
        return value.toExponential(2) + ' ' + unit;
    }

    init();
});
