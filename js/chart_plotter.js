// js/chart_plotter.js

class ChartPlotter {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.padding = options.padding || { top: 20, right: 20, bottom: 40, left: 60 };
        this.onDrawStats = options.onDrawStats || null;
        
        this.ctx = this.setupCanvas();

        this.view = { scaleX: 1.0, scaleY: 1.0, offsetX: 0, offsetY: 0, panning: false, lastMouseX: 0, lastMouseY: 0 };
        this.data = {
            type: 'time', // 'time' or 'fft'
            points: [],
            startTime: 0,
            increment: 1e-9,
            minY: 0,
            maxY: 0,
            nyquist: 0, // For FFT
        };
        this.renderOptions = {
            mode: 'minmax',
            level: 25,
            color: '#33ff99'
        };
        this.axisFormatters = {};

        this.attachEventListeners();
    }

    setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        const ctx = this.canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        return ctx;
    }

    attachEventListeners() {
        this.canvas.addEventListener('wheel', this.handleZoom.bind(this));
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));
        window.addEventListener('resize', () => {
            this.ctx = this.setupCanvas();
            this.draw();
        });
    }

    setData(data, renderOptions, axisFormatters) {
        this.data = { ...this.data, ...data };
        this.renderOptions = { ...this.renderOptions, ...renderOptions };
        this.axisFormatters = axisFormatters || {};
        this.resetView();
    }

    setRenderOptions(options) {
        this.renderOptions = { ...this.renderOptions, ...options };
        this.draw();
    }

    getDimensions() {
        const { width, height } = this.canvas.getBoundingClientRect();
        return {
            width,
            height,
            chartWidth: width - this.padding.left - this.padding.right,
            chartHeight: height - this.padding.top - this.padding.bottom
        };
    }

    constrainView() {
        if (!this.data.points || this.data.points.length === 0) return;
        const { chartWidth, chartHeight } = this.getDimensions();

        if (this.data.type === 'time') {
            const timeDuration = this.data.points.length * this.data.increment;
            const signalWidth = timeDuration * this.view.scaleX;
            
            if (signalWidth < chartWidth) {
                this.view.offsetX = (chartWidth - signalWidth) / 2 - (this.data.startTime * this.view.scaleX);
            } else {
                const minOffsetX = chartWidth - (this.data.startTime + timeDuration) * this.view.scaleX;
                const maxOffsetX = -this.data.startTime * this.view.scaleX;
                if (this.view.offsetX > maxOffsetX) this.view.offsetX = maxOffsetX;
                if (this.view.offsetX < minOffsetX) this.view.offsetX = minOffsetX;
            }
        } else { // FFT constraints
            const signalWidth = this.data.nyquist * this.view.scaleX;
            if (signalWidth < chartWidth) {
                this.view.offsetX = (chartWidth - signalWidth) / 2;
            } else {
                if (this.view.offsetX > 0) this.view.offsetX = 0;
                const minOffsetX = chartWidth - signalWidth;
                if (this.view.offsetX < minOffsetX) this.view.offsetX = minOffsetX;
            }
        }

        // Common Y-axis constraints for both modes
        const yRange = this.data.maxY - this.data.minY;
        const yPadding = this.data.type === 'time' ? (yRange * 0.1 || 1) : (yRange * 0.1 || 10);
        const signalTop = this.data.maxY + yPadding;
        const signalBottom = this.data.minY - yPadding;
        const signalHeightPixels = (signalTop - signalBottom) * Math.abs(this.view.scaleY);

        if (signalHeightPixels < chartHeight) {
            const middleY = (signalTop + signalBottom) / 2;
            this.view.offsetY = chartHeight / 2 - middleY * this.view.scaleY;
        } else {
            const topPixel = signalTop * this.view.scaleY + this.view.offsetY;
            const bottomPixel = signalBottom * this.view.scaleY + this.view.offsetY;
            if (topPixel > 0) this.view.offsetY -= topPixel;
            if (bottomPixel < chartHeight) this.view.offsetY += (chartHeight - bottomPixel);
        }
    }

    resetView() {
        if (!this.data.points || this.data.points.length === 0) return;
        const { chartWidth, chartHeight } = this.getDimensions();

        let minY = this.data.minY;
        let maxY = this.data.maxY;

        if (this.data.type === 'time') {
            const timeDuration = this.data.points.length * this.data.increment;
            this.view.scaleX = chartWidth / (timeDuration || 1);
            this.view.offsetX = -this.data.startTime * this.view.scaleX;

            if (minY === maxY) {
                minY -= 1;
                maxY += 1;
            }

            const yRange = maxY - minY;
            const yPadding = yRange * 0.1 || 1;
            this.view.scaleY = - (chartHeight / (yRange + 2 * yPadding));
            this.view.offsetY = -(maxY + yPadding) * this.view.scaleY;
        } else { // FFT reset
            this.view.scaleX = chartWidth / this.data.nyquist;
            this.view.offsetX = 0;

            if (minY === maxY) {
                minY -= 10;
                maxY += 10;
            }

            const dbRange = maxY - minY;
            const yPadding = dbRange * 0.1 || 10;
            this.view.scaleY = -chartHeight / (dbRange + yPadding);
            this.view.offsetY = -(maxY + yPadding * 0.8) * this.view.scaleY;
        }
    }

    handleZoom(e) {
        e.preventDefault();
        const z = 1 + (e.deltaY < 0 ? 1 : -1) * 0.1;
        const { chartWidth, chartHeight } = this.getDimensions();
        const mouseX = e.offsetX - this.padding.left;
        const mouseY = e.offsetY - this.padding.top;

        if (e.ctrlKey) { // Y-axis zoom
            if (e.deltaY > 0) { // Zoom out
                let minScaleY;
                if (this.data.type === 'time') {
                    const yRange = this.data.maxY - this.data.minY;
                    const yPadding = yRange * 0.1 || 1;
                    minScaleY = -chartHeight / (yRange + 2 * yPadding);
                } else { // FFT
                    const dbRange = this.data.maxY - this.data.minY;
                    const yPadding = dbRange * 0.1 || 10;
                    minScaleY = -chartHeight / (dbRange + yPadding);
                }
                if (Math.abs(this.view.scaleY) <= Math.abs(minScaleY)) return;
            }
            const val = (mouseY - this.view.offsetY) / this.view.scaleY;
            this.view.scaleY *= z;
            this.view.offsetY = mouseY - val * this.view.scaleY;
        } else { // X-axis zoom
            if (e.deltaY > 0) { // Zoom out
                let minScaleX;
                if (this.data.type === 'time') {
                    const timeDuration = this.data.points.length * this.data.increment;
                    minScaleX = chartWidth / (timeDuration || 1);
                } else { // FFT
                    minScaleX = chartWidth / this.data.nyquist;
                }
                if (this.view.scaleX <= minScaleX) return;
            }
            const val = (mouseX - this.view.offsetX) / this.view.scaleX;
            this.view.scaleX *= z;
            this.view.offsetX = mouseX - val * this.view.scaleX;
        }
        
        this.constrainView();
        this.draw();
    }

    handleMouseDown(e) {
        this.view.panning = true;
        this.view.lastMouseX = e.offsetX;
        this.view.lastMouseY = e.offsetY;
    }

    handleMouseMove(e) {
        if (this.view.panning) {
            const dx = e.offsetX - this.view.lastMouseX;
            const dy = e.offsetY - this.view.lastMouseY;
            this.view.offsetX += dx;
            this.view.offsetY += dy;
            this.constrainView();
            this.view.lastMouseX = e.offsetX;
            this.view.lastMouseY = e.offsetY;
            this.draw();
        }
    }

    handleMouseUp() {
        this.view.panning = false;
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const dimensions = this.getDimensions();
        
        this.drawGrid(dimensions);
        
        if (!this.data.points || this.data.points.length === 0) {
            this.ctx.save();
            this.ctx.translate(this.padding.left, this.padding.top);
            this.ctx.fillStyle = "#666";
            this.ctx.textAlign = "center";
            this.ctx.font = "16px Arial";
            this.ctx.fillText("Brak danych do wyświetlenia.", dimensions.chartWidth / 2, dimensions.chartHeight / 2);
            this.ctx.restore();
            if (this.onDrawStats) this.onDrawStats(null);
            return;
        }
        
        const stats = this.drawWaveform(dimensions);
        if (this.onDrawStats) this.onDrawStats(stats);
    }

    drawGrid(dimensions) {
        const { chartWidth, chartHeight } = dimensions;
        const { x: formatX, y: formatY, xLabel, yLabel } = this.axisFormatters;
        if (!formatX || !formatY) return;

        this.ctx.save();
        this.ctx.font = "10px Arial";
        this.ctx.fillStyle = "#888";
        this.ctx.translate(this.padding.left, this.padding.top);

        // Y-Axis
        this.ctx.textAlign = "right";
        const yRange = chartHeight / Math.abs(this.view.scaleY);
        let yStep = Math.pow(10, Math.floor(Math.log10(yRange))) / 5;
        if (yStep <= 0 || !isFinite(yStep)) yStep = 0.1;
        const yTop = (0 - this.view.offsetY) / this.view.scaleY;
        let yVal = Math.floor(yTop / yStep) * yStep;
        for (let i = 0; i < 2 * chartHeight && isFinite(yVal) && yStep > 0; i++) {
            const y = yVal * this.view.scaleY + this.view.offsetY;
            if (y > chartHeight + 10) break;
            if (y >= -10) {
                const isZero = Math.abs(yVal) < 1e-9;
                this.ctx.strokeStyle = isZero ? '#00aaff' : '#444';
                this.ctx.lineWidth = isZero ? 1 : 0.5;
                this.ctx.beginPath(); this.ctx.moveTo(0, y); this.ctx.lineTo(chartWidth, y); this.ctx.stroke();
                if (!isZero) this.ctx.fillText(formatY(yVal), -8, y + 3);
            }
            yVal -= yStep;
        }

        // X-Axis
        this.ctx.textAlign = "center";
        const xRange = chartWidth / this.view.scaleX;
        let xStep = Math.pow(10, Math.floor(Math.log10(xRange))) / 10;
        if (xStep <= 0 || !isFinite(xStep)) xStep = 1e-3;
        const xFirst = -this.view.offsetX / this.view.scaleX;
        let xVal = Math.ceil(xFirst / xStep) * xStep;
        for (let i = 0; i < 2 * chartWidth && isFinite(xVal) && xStep > 0; i++) {
            const x = xVal * this.view.scaleX + this.view.offsetX;
            if (x > chartWidth + 10) break;
            if (x >= -10) {
                const isZero = Math.abs(xVal) < 1e-12;
                this.ctx.strokeStyle = isZero ? '#00aaff' : '#444';
                this.ctx.lineWidth = isZero ? 1 : 0.5;
                this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, chartHeight); this.ctx.stroke();
                if (!isZero) this.ctx.fillText(formatX(xVal), x, chartHeight + 15);
            }
            xVal += xStep;
        }

        // Axis Labels
        this.ctx.fillText(xLabel || '', chartWidth / 2, chartHeight + 30);
        this.ctx.save();
        this.ctx.translate(-45, chartHeight / 2);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.fillText(yLabel || '', 0, 0);
        this.ctx.restore();

        this.ctx.restore();
    }

    drawWaveform(dimensions) {
        const { chartWidth, chartHeight } = dimensions;
        const { points, increment, startTime } = this.data;
        const { mode, color, level } = this.renderOptions;

        this.ctx.save();
        this.ctx.translate(this.padding.left, this.padding.top);
        this.ctx.beginPath();
        this.ctx.rect(0, 0, chartWidth, chartHeight);
        this.ctx.clip();

        const startIndex = Math.max(0, Math.floor((-this.view.offsetX / this.view.scaleX - startTime) / increment));
        const endIndex = Math.min(points.length, Math.ceil(((chartWidth - this.view.offsetX) / this.view.scaleX - startTime) / increment));
        const pointsInView = endIndex - startIndex;

        if (mode === 'minmax') {
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            for (let px = 0; px < chartWidth; px++) {
                const timeStartPx = (px - this.view.offsetX) / this.view.scaleX;
                const timeEndPx = (px + 1 - this.view.offsetX) / this.view.scaleX;
                const startIdx = Math.max(0, Math.floor((timeStartPx - startTime) / increment));
                const endIdx = Math.min(points.length, Math.ceil((timeEndPx - startTime) / increment));
                if (startIdx >= endIdx) continue;
                
                let localMin = points[startIdx], localMax = points[startIdx];
                for (let i = startIdx + 1; i < endIdx; i++) {
                    const v = points[i];
                    if (v < localMin) localMin = v;
                    if (v > localMax) localMax = v;
                }
                const y1 = localMin * this.view.scaleY + this.view.offsetY;
                const y2 = localMax * this.view.scaleY + this.view.offsetY;
                this.ctx.moveTo(px, y1);
                this.ctx.lineTo(px, y2);
            }
            this.ctx.stroke();
            this.ctx.restore();
            return { displayed: pointsInView, total: pointsInView, mode: 'minmax' };
        } 
        
        // Line or Points
        const baseDensity = chartWidth * 2;
        const maxDensity = pointsInView;
        const density = baseDensity + (maxDensity - baseDensity) * ((level - 1) / 99);
        const step = Math.max(1, Math.floor(pointsInView / density));
        const displayedPoints = Math.floor(pointsInView / step);

        if (mode === 'points') {
            this.ctx.fillStyle = color;
            for (let i = startIndex; i < endIndex; i += step) {
                const x = (startTime + i * increment) * this.view.scaleX + this.view.offsetX;
                const y = points[i] * this.view.scaleY + this.view.offsetY;
                this.ctx.fillRect(x - 0.5, y - 0.5, 2, 2);
            }
        } else { // 'line'
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            if (startIndex < endIndex) {
                let i = startIndex;
                let x = (startTime + i * increment) * this.view.scaleX + this.view.offsetX;
                let y = points[i] * this.view.scaleY + this.view.offsetY;
                this.ctx.moveTo(x, y);
                for (i = startIndex + step; i < endIndex; i += step) {
                    x = (startTime + i * increment) * this.view.scaleX + this.view.offsetX;
                    y = points[i] * this.view.scaleY + this.view.offsetY;
                    this.ctx.lineTo(x, y);
                }
            }
            this.ctx.stroke();
        }
        
        this.ctx.restore();
        return { displayed: displayedPoints, total: pointsInView, mode: mode };
    }
}
