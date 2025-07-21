// js/generator.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Elementy DOM ---
    const sampleRateInput = document.getElementById('sample-rate');
    const sampleRateUnitInput = document.getElementById('sample-rate-unit');
    const durationInput = document.getElementById('duration');
    const durationUnitInput = document.getElementById('duration-unit');
    const addComponentBtn = document.getElementById('add-component-btn');
    const resetBtn = document.getElementById('reset-btn');
    const saveBtn = document.getElementById('save-btn');
    const resetViewBtn = document.getElementById('reset-view-btn');
    const globalStatusDiv = document.getElementById('global-status');
    const canvas = document.getElementById('plot-canvas');
    const componentsContainer = document.getElementById('components-container');
    const componentTemplate = document.getElementById('component-template');
    const tooltipPanel = document.getElementById('tooltip-panel');
    const optimizationSlider = document.getElementById('optimization-slider');
    const densityInfo = document.getElementById('density-info');
    const sliderControl = document.querySelector('.slider-control');

    // --- Globalne zmienne ---
    let finalSignalData = [];
    let signalComponents = [];
    let nextComponentId = 0;
    let renderMode = 'minmax';
    let optimizationLevel = 25;
    
    const chart = new ChartPlotter(canvas, {
        padding: { top: 20, right: 20, bottom: 40, left: 60 },
        onDrawStats: (stats) => {
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

    // --- Inicjalizacja ---
    function init() {
        addComponentBtn.addEventListener('click', addNewComponent);
        resetBtn.addEventListener('click', resetGenerator);
        saveBtn.addEventListener('click', saveToCSV);
        resetViewBtn.addEventListener('click', () => chart.resetView());
        
        [sampleRateInput, sampleRateUnitInput, durationInput, durationUnitInput].forEach(el => el.addEventListener('input', regenerateFinalSignal));
        
        document.querySelectorAll('input[name="renderMode"]').forEach(radio => {
            radio.addEventListener('change', function() { 
                renderMode = this.value; 
                sliderControl.style.display = renderMode === 'minmax' ? 'none' : 'flex';
                chart.setRenderOptions({ mode: renderMode });
            });
        });
        optimizationSlider.addEventListener('input', (e) => {
            optimizationLevel = parseInt(e.target.value, 10);
            chart.setRenderOptions({ level: optimizationLevel });
        });
        sliderControl.style.display = 'none';

        // Tooltip logic remains here as it's specific to the generator's view
        canvas.addEventListener('mousemove', (e) => {
            const { chartWidth, chartHeight } = chart.getDimensions();
            const mouseX_chart = e.offsetX - chart.padding.left;
            const mouseY_chart = e.offsetY - chart.padding.top;

            if (finalSignalData.length > 0 && mouseX_chart >= 0 && mouseX_chart <= chartWidth && mouseY_chart >= 0 && mouseY_chart <= chartHeight) {
                tooltipPanel.style.display = 'block';
                tooltipPanel.style.left = `${e.clientX + 15}px`;
                tooltipPanel.style.top = `${e.clientY + 15}px`;
                const time = (mouseX_chart - chart.view.offsetX) / chart.view.scaleX;
                const voltage = (mouseY_chart - chart.view.offsetY) / chart.view.scaleY;
                tooltipPanel.innerHTML = `${formatValue(time, 's')}<br>${formatValue(voltage, 'V')}`;
            } else {
                tooltipPanel.style.display = 'none';
            }
        });
        canvas.addEventListener('mouseleave', () => {
            tooltipPanel.style.display = 'none';
        });

        updateUIState();
        regenerateFinalSignal();
    }

    function updateUIState() {
        const hasComponents = signalComponents.length > 0;
        saveBtn.disabled = !hasComponents;
        resetBtn.disabled = !hasComponents;
        resetViewBtn.disabled = finalSignalData.length === 0;
    }

    function resetGenerator() {
        signalComponents = [];
        componentsContainer.innerHTML = '';
        regenerateFinalSignal();
    }

    function addNewComponent() {
        const componentId = nextComponentId++;
        const newComponent = { id: componentId, waveType: 'sine', amplitude: 1, frequency: 1000, phase: 0, spikeDensity: 1 };
        signalComponents.push(newComponent);

        const tile = componentTemplate.content.cloneNode(true).firstElementChild;
        tile.dataset.id = componentId;

        const updateComponentValue = () => {
            const freqValue = parseFloat(tile.querySelector('.frequency').value) || 0;
            const freqMultiplier = parseFloat(tile.querySelector('.frequency-unit').value) || 1;
            const ampValue = parseFloat(tile.querySelector('.amplitude').value) || 0;
            const ampMultiplier = parseFloat(tile.querySelector('.amplitude-unit').value) || 1;

            newComponent.frequency = freqValue * freqMultiplier;
            newComponent.amplitude = ampValue * ampMultiplier;
            newComponent.phase = parseFloat(tile.querySelector('.phase').value) || 0;
            newComponent.spikeDensity = parseFloat(tile.querySelector('.spike-density').value) || 0;
            regenerateFinalSignal();
        };

        tile.querySelector('.wave-type').addEventListener('change', (e) => {
            newComponent.waveType = e.target.value;
            updateComponentControls(tile, newComponent.waveType);
            updateComponentValue();
        });
        
        tile.querySelector('.remove-btn').addEventListener('click', () => removeComponent(componentId));
        
        tile.querySelectorAll('input, select').forEach(el => {
            if(!el.classList.contains('wave-type') && !el.classList.contains('remove-btn')) {
                el.addEventListener('input', updateComponentValue);
            }
        });
        
        componentsContainer.appendChild(tile);
        updateComponentControls(tile, newComponent.waveType);
        updateComponentValue();
    }

    function removeComponent(id) {
        signalComponents = signalComponents.filter(c => c.id !== id);
        const tileToRemove = componentsContainer.querySelector(`[data-id='${id}']`);
        if (tileToRemove) tileToRemove.remove();
        regenerateFinalSignal();
    }
    
    function updateComponentControls(tile, waveType) {
        const freqControl = tile.querySelector('.frequency-control');
        const spikeControl = tile.querySelector('.spikes-density-control');
        const phaseControl = tile.querySelector('.phase-control');
        const hasPhase = ['sine', 'square', 'triangle', 'sawtooth'].includes(waveType);
        
        freqControl.style.display = ['noise', 'spikes', 'dc'].includes(waveType) ? 'none' : 'flex';
        spikeControl.style.display = waveType === 'spikes' ? 'flex' : 'none';
        phaseControl.style.display = hasPhase ? 'flex' : 'none';
    }

    function regenerateFinalSignal() {
        try {
            const sampleRate = (parseFloat(sampleRateInput.value) || 0) * (parseFloat(sampleRateUnitInput.value) || 0);
            const duration = (parseFloat(durationInput.value) || 0) * (parseFloat(durationUnitInput.value) || 0);

            let minY = 0, maxY = 0;

            if (sampleRate <= 0 || duration <= 0) {
                finalSignalData = [];
                globalStatusDiv.textContent = signalComponents.length > 0 ? 'Próbkowanie i czas muszą być dodatnie.' : 'Dodaj komponent, aby rozpocząć.';
            } else {
                const numSamples = Math.floor(duration * sampleRate);
                const increment = 1 / sampleRate;
                finalSignalData = new Float32Array(numSamples);

                for (const component of signalComponents) {
                    const { amplitude: amp, frequency: freq, phase, spikeDensity, waveType } = component;
                    if (freq <= 0 && !['noise', 'spikes', 'dc'].includes(waveType)) continue;

                    const phaseRad = phase * Math.PI / 180;

                    for (let i = 0; i < numSamples; i++) {
                        const t = i * increment;
                        let value = 0;
                        switch (waveType) {
                            case 'sine': value = amp * Math.sin(2 * Math.PI * freq * t + phaseRad); break;
                            case 'square': value = amp * Math.sign(Math.sin(2 * Math.PI * freq * t + phaseRad)); break;
                            case 'triangle': value = amp * (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * freq * t + phaseRad)); break;
                            case 'sawtooth': value = amp * (2 * ((t * freq + (phase / 360)) - Math.floor(0.5 + (t * freq + (phase / 360))))); break;
                            case 'dc': value = amp; break;
                            case 'noise': value = amp * (2 * Math.random() - 1); break;
                            case 'spikes': value = (Math.random() < (spikeDensity / 100)) ? amp * (Math.random() > 0.5 ? 1 : -1) : 0; break;
                        }
                        finalSignalData[i] += value;
                    }
                }

                if (finalSignalData.length > 0) {
                    minY = finalSignalData[0];
                    maxY = finalSignalData[0];
                    for(const v of finalSignalData) {
                        if (v < minY) minY = v;
                        if (v > maxY) maxY = v;
                    }
                }

                globalStatusDiv.textContent = `${numSamples.toLocaleString('pl-PL')} próbek`;
                if (signalComponents.length === 0) {
                    globalStatusDiv.textContent = 'Dodaj komponent, aby rozpocząć.';
                }
            }
            
            const durationUnitText = durationUnitInput.options[durationUnitInput.selectedIndex].text;
            const axisFormatters = {
                x: (val) => {
                    if (durationUnitInput.value === '1') return val.toFixed(2);
                    if (durationUnitInput.value === '0.001') return (val * 1000).toFixed(2);
                    return (val * 1000000).toFixed(2);
                },
                y: (v) => v.toFixed(2),
                xLabel: `Czas [${durationUnitText}]`,
                yLabel: 'Napięcie [V]'
            };

            chart.setData({
                type: 'time',
                points: finalSignalData,
                startTime: 0,
                increment: sampleRate > 0 ? 1 / sampleRate : 0,
                minY: minY,
                maxY: maxY,
            }, {
                mode: renderMode,
                level: optimizationLevel,
                color: '#33ff99'
            }, axisFormatters);
            
            updateUIState();

        } catch (error) {
            globalStatusDiv.textContent = `❌ Błąd: ${error.message}`;
            chart.setData({ points: [] });
        }
    }
    
    function saveToCSV() {
        if (finalSignalData.length === 0) return;
        try {
            const sampleRate = (parseFloat(sampleRateInput.value) || 0) * (parseFloat(sampleRateUnitInput.value) || 0);
            const increment = 1 / sampleRate;
            const header = "CH1;Start;Increment;";
            const meta = `Volt;${(0).toExponential(6).replace('.', ',')};${increment.toExponential(6).replace('.', ',')}`;
            let csvContent = `${header}\n${meta}\n`;
            finalSignalData.forEach(v => { csvContent += `${(v || 0).toExponential(2).replace('.', ',')};\n`; });
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = 'sygnal_zlozony.csv';
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (error) {
            globalStatusDiv.textContent = `❌ Błąd podczas zapisu.`
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