// js/ppt.js - AI-Powered PowerPoint Export with OpenAI (GPT-4)
// FIXED: color-format corruption bugs + full visual redesign

// =====================================================================
// THEME DEFINITIONS (kept with '#' — the UI/CSS layer needs it)
// =====================================================================
if (typeof THEMES === 'undefined') {
    var THEMES = [{
        id: 'tranquil',
        name: 'Tranquil',
        desc: 'Teal, coral & gold – calm yet vibrant',
        colors: {
            primary: '#009688',
            primaryDark: '#00796b',
            primaryLight: '#4db6ac',
            secondary: '#ff6b6b',
            accent: '#feca57',
            background: '#ffffff',
            text: '#1f2933',
            slideBg: '#ffffff',
            titleColor: '#009688',
            headingColor: '#00796b',
            bulletColor: '#ff6b6b',
            accentBar: '#009688',
            gradientStart: '#009688',
            gradientEnd: '#4db6ac',
            chartColors: ['#009688', '#ff6b6b', '#feca57', '#4db6ac', '#80cbc4']
        },
        previewColors: ['#009688', '#ff6b6b', '#feca57']
    }, {
        id: 'cigar',
        name: 'Cigar',
        desc: 'Warm browns, gold & cream – sophisticated',
        colors: {
            primary: '#8d6e63',
            primaryDark: '#6d4c41',
            primaryLight: '#d7ccc8',
            secondary: '#d4a373',
            accent: '#cc8e6e',
            background: '#ffffff',
            text: '#3e2723',
            slideBg: '#ffffff',
            titleColor: '#6d4c41',
            headingColor: '#5d4037',
            bulletColor: '#8d6e63',
            accentBar: '#8d6e63',
            gradientStart: '#8d6e63',
            gradientEnd: '#d7ccc8',
            chartColors: ['#8d6e63', '#d4a373', '#cc8e6e', '#bcaaa4', '#efebe9']
        },
        previewColors: ['#8d6e63', '#d4a373', '#cc8e6e']
    }, {
        id: 'ocean',
        name: 'Ocean',
        desc: 'Deep blue, teal & coral – professional with pop',
        colors: {
            primary: '#0d47a1',
            primaryDark: '#0a3d8a',
            primaryLight: '#64b5f6',
            secondary: '#26c6da',
            accent: '#ff6b6b',
            background: '#ffffff',
            text: '#0d1b2a',
            slideBg: '#ffffff',
            titleColor: '#0d47a1',
            headingColor: '#0d47a1',
            bulletColor: '#26c6da',
            accentBar: '#0d47a1',
            gradientStart: '#0d47a1',
            gradientEnd: '#64b5f6',
            chartColors: ['#0d47a1', '#26c6da', '#ff6b6b', '#4fc3f7', '#81d4fa']
        },
        previewColors: ['#0d47a1', '#26c6da', '#ff6b6b']
    }, {
        id: 'forest',
        name: 'Forest',
        desc: 'Green, yellow & brown – natural and fresh',
        colors: {
            primary: '#2e7d32',
            primaryDark: '#1b5e20',
            primaryLight: '#81c784',
            secondary: '#fdd835',
            accent: '#8d6e63',
            background: '#ffffff',
            text: '#1b3a1b',
            slideBg: '#ffffff',
            titleColor: '#2e7d32',
            headingColor: '#1b5e20',
            bulletColor: '#fdd835',
            accentBar: '#2e7d32',
            gradientStart: '#2e7d32',
            gradientEnd: '#81c784',
            chartColors: ['#2e7d32', '#fdd835', '#8d6e63', '#66bb6a', '#a5d6a7']
        },
        previewColors: ['#2e7d32', '#fdd835', '#8d6e63']
    }, {
        id: 'sunset',
        name: 'Sunset',
        desc: 'Orange, pink & yellow – energetic and warm',
        colors: {
            primary: '#e65100',
            primaryDark: '#bf360c',
            primaryLight: '#ffab91',
            secondary: '#ff6b6b',
            accent: '#feca57',
            background: '#ffffff',
            text: '#4e2a1a',
            slideBg: '#ffffff',
            titleColor: '#d84315',
            headingColor: '#bf360c',
            bulletColor: '#ff6b6b',
            accentBar: '#e65100',
            gradientStart: '#e65100',
            gradientEnd: '#ffab91',
            chartColors: ['#e65100', '#ff6b6b', '#feca57', '#ffab91', '#ffccbc']
        },
        previewColors: ['#e65100', '#ff6b6b', '#feca57']
    }, {
        id: 'monochrome',
        name: 'Monochrome',
        desc: 'Black, gray & white – timeless elegance',
        colors: {
            primary: '#424242',
            primaryDark: '#212121',
            primaryLight: '#bdbdbd',
            secondary: '#9e9e9e',
            accent: '#616161',
            background: '#ffffff',
            text: '#212121',
            slideBg: '#ffffff',
            titleColor: '#424242',
            headingColor: '#424242',
            bulletColor: '#616161',
            accentBar: '#424242',
            gradientStart: '#424242',
            gradientEnd: '#bdbdbd',
            chartColors: ['#424242', '#9e9e9e', '#bdbdbd', '#757575', '#616161']
        },
        previewColors: ['#424242', '#9e9e9e', '#bdbdbd']
    }, {
        id: 'royal',
        name: 'Royal',
        desc: 'Purple, gold & pink – regal and elegant',
        colors: {
            primary: '#6a1b9a',
            primaryDark: '#4a148c',
            primaryLight: '#ce93d8',
            secondary: '#fbbf24',
            accent: '#f472b6',
            background: '#ffffff',
            text: '#311b92',
            slideBg: '#ffffff',
            titleColor: '#6a1b9a',
            headingColor: '#4a148c',
            bulletColor: '#fbbf24',
            accentBar: '#6a1b9a',
            gradientStart: '#6a1b9a',
            gradientEnd: '#ce93d8',
            chartColors: ['#6a1b9a', '#fbbf24', '#f472b6', '#ab47bc', '#ce93d8']
        },
        previewColors: ['#6a1b9a', '#fbbf24', '#f472b6']
    }, {
        id: 'clinical',
        name: 'Clinical',
        desc: 'Clean blue, teal & gray – medical clarity',
        colors: {
            primary: '#0d47a1',
            primaryDark: '#0a3d8a',
            primaryLight: '#64b5f6',
            secondary: '#26c6da',
            accent: '#78909c',
            background: '#ffffff',
            text: '#0d1b2a',
            slideBg: '#ffffff',
            titleColor: '#0d47a1',
            headingColor: '#0d47a1',
            bulletColor: '#26c6da',
            accentBar: '#0d47a1',
            gradientStart: '#0d47a1',
            gradientEnd: '#64b5f6',
            chartColors: ['#0d47a1', '#26c6da', '#78909c', '#64b5f6', '#90a4ae']
        },
        previewColors: ['#0d47a1', '#26c6da', '#78909c']
    }];
}

// =====================================================================
// STATE
// =====================================================================
let selectedTheme = THEMES[0];
let selectedArtStyle = 'professional';
let contentData = null;
let aiConfig = { token: null, endpoint: 'https://api.openai.com/v1', model: 'gpt-4.1' };
let structuredSlides = null;
let currentUser = null;
let isInitialized = false;

// =====================================================================
// DOM REFS
// =====================================================================
let themeCarousel = null;
let generateBtn = null;
let slideCountSpan = null;
let toastContainer = null;
let pptInstructions = null;
let themePrev = null;
let themeNext = null;
let generationStatus = null;
let statusText = null;

function getDOMElements() {
    themeCarousel = document.getElementById('themeCarousel');
    generateBtn = document.getElementById('generatePptBtn');
    slideCountSpan = document.getElementById('slideCount');
    toastContainer = document.getElementById('toast-container');
    pptInstructions = document.getElementById('pptInstructions');
    themePrev = document.getElementById('themePrev');
    themeNext = document.getElementById('themeNext');
    generationStatus = document.getElementById('generationStatus');
    statusText = document.getElementById('statusText');
}

function waitForDOM() {
    return new Promise((resolve) => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', resolve);
        } else {
            resolve();
        }
    });
}

function waitForFirebase() {
    return new Promise((resolve) => {
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
            resolve();
            return;
        }
        let attempts = 0;
        const checkInterval = setInterval(() => {
            attempts++;
            if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
                clearInterval(checkInterval);
                resolve();
            } else if (attempts > 50) {
                clearInterval(checkInterval);
                console.warn('Firebase not loaded after 5 seconds, continuing...');
                resolve();
            }
        }, 100);
    });
}

function showToast(msg, type = 'success', duration = 4000) {
    if (!toastContainer) {
        console.warn('Toast container not found');
        return;
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icon = type === 'error' ? 'exclamation-circle' :
        type === 'warning' ? 'exclamation-triangle' : 'check-circle';
    el.innerHTML = `<i class="fas fa-${icon}"></i> ${msg}`;
    toastContainer.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.3s';
        setTimeout(() => el.remove(), 300);
    }, duration);
}

async function fetchTokens() {
    try {
        await waitForFirebase();
        if (typeof firebase === 'undefined' || !firebase.apps || firebase.apps.length === 0) {
            console.warn('Firebase not available, using fallback token');
            if (window.aiConfig && window.aiConfig.token) {
                aiConfig.token = window.aiConfig.token;
                return true;
            }
            return false;
        }
        const database = firebase.database();
        const snapshot = await database.ref('tokens/open_ai').once('value');
        const data = snapshot.val();
        if (data?.api_key) {
            aiConfig.token = data.api_key;
            aiConfig.endpoint = 'https://api.openai.com/v1';
            aiConfig.model = 'gpt-4.1';
            return true;
        }
        console.warn('OpenAI API key missing. Using fallback local structuring.');
        return false;
    } catch (error) {
        console.error('Token fetch error:', error);
        return false;
    }
}

// =====================================================================
// RENDER THEMES (UI carousel — uses '#' hex, this is CSS not PptxGenJS)
// =====================================================================
function renderThemes() {
    getDOMElements();

    if (!themeCarousel) {
        const wrapper = document.querySelector('.theme-carousel-wrapper');
        if (wrapper) {
            const carousel = document.createElement('div');
            carousel.id = 'themeCarousel';
            carousel.className = 'theme-carousel';
            wrapper.prepend(carousel);
            themeCarousel = carousel;
        } else {
            console.error('Cannot find or create theme carousel');
            return;
        }
    }

    themeCarousel.innerHTML = '';
    THEMES.forEach(theme => {
        const div = document.createElement('div');
        div.className = 'theme-option' + (theme.id === selectedTheme.id ? ' selected' : '');
        div.dataset.themeId = theme.id;
        const previewHtml = theme.previewColors.map(c =>
            `<span class="dot" style="background:${c}"></span>`
        ).join('');
        div.innerHTML = `
            <div class="theme-preview" style="background: ${theme.colors.primary};">
                <span style="color: #fff;">${theme.name}</span>
                ${previewHtml}
            </div>
            <div class="theme-name">${theme.name}</div>
            <div class="theme-desc">${theme.desc}</div>
            <div class="check-mark"><i class="fas fa-check"></i></div>
        `;
        div.addEventListener('click', () => {
            document.querySelectorAll('.theme-option').forEach(el => el.classList.remove('selected'));
            div.classList.add('selected');
            selectedTheme = THEMES.find(t => t.id === theme.id);
            updateSlideCount();
            updateStepIndicator(1);
        });
        themeCarousel.appendChild(div);
    });
}

function updateStepIndicator(step) {
    const stepItems = document.querySelectorAll('.step-item');
    if (!stepItems.length) return;
    stepItems.forEach((item, index) => {
        const stepNum = index + 1;
        item.classList.remove('active');
        if (stepNum === step) {
            item.classList.add('active');
        } else if (stepNum < step) {
            item.classList.add('completed');
        } else {
            item.classList.remove('completed');
        }
    });
}

function scrollCarousel(direction) {
    getDOMElements();
    if (!themeCarousel) return;
    const scrollAmount = 220;
    themeCarousel.scrollBy({ left: direction === 'next' ? scrollAmount : -scrollAmount, behavior: 'smooth' });
}

function setupCarouselNav() {
    getDOMElements();
    if (themePrev) themePrev.addEventListener('click', () => scrollCarousel('prev'));
    if (themeNext) themeNext.addEventListener('click', () => scrollCarousel('next'));
}

function updateSlideCount() {
    getDOMElements();
    if (structuredSlides) {
        if (slideCountSpan) slideCountSpan.textContent = structuredSlides.length + 2;
        return;
    }
    if (!contentData) {
        if (slideCountSpan) slideCountSpan.textContent = '0';
        return;
    }
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = contentData.content;
    const headings = tempDiv.querySelectorAll('h1, h2, h3');
    let count = Math.max(1, headings.length) || 5;
    if (slideCountSpan) slideCountSpan.textContent = count + 2;
}

function loadContent() {
    getDOMElements();
    const raw = localStorage.getItem('pptExportData');
    if (!raw) {
        showToast('No document content found. Please generate a document first.', 'error');
        if (generateBtn) {
            generateBtn.disabled = true;
            generateBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> No content loaded';
        }
        return false;
    }
    try {
        contentData = JSON.parse(raw);
        updateSlideCount();
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generate & Download';
        }
        return true;
    } catch (e) {
        showToast('Error loading content.', 'error');
        if (generateBtn) {
            generateBtn.disabled = true;
            generateBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error loading content';
        }
        return false;
    }
}

// =====================================================================
// VALIDATE AND CLEAN SLIDE DATA
// =====================================================================
function validateAndCleanSlides(slides) {
    if (!Array.isArray(slides) || slides.length === 0) return null;

    const cleaned = slides.map((slide, index) => {
        const clean = {
            title: String(slide.title || `Slide ${index + 1}`).trim() || `Slide ${index + 1}`,
            type: slide.type || 'content',
            bullets: Array.isArray(slide.bullets) ? slide.bullets.slice(0, 6) : [],
            layout: slide.layout || 'single'
        };
        clean.bullets = clean.bullets
            .filter(b => b && String(b).trim().length > 0)
            .map(b => String(b).trim())
            .slice(0, 6);
        if (clean.bullets.length === 0) clean.bullets = ['No content available for this section'];

        if (slide.chartData && typeof slide.chartData === 'object') {
            const allowedTypes = ['bar', 'line', 'pie', 'doughnut', 'area', 'radar'];
            clean.chartData = {
                type: allowedTypes.includes(slide.chartData.type) ? slide.chartData.type : 'bar',
                labels: Array.isArray(slide.chartData.labels) ? slide.chartData.labels : [],
                datasets: Array.isArray(slide.chartData.datasets) ? slide.chartData.datasets : []
            };
        }
        if (slide.comparisonData && typeof slide.comparisonData === 'object') {
            clean.comparisonData = {
                left: Array.isArray(slide.comparisonData.left) ? slide.comparisonData.left : [],
                right: Array.isArray(slide.comparisonData.right) ? slide.comparisonData.right : []
            };
        }
        if (slide.timelineData && Array.isArray(slide.timelineData)) {
            clean.timelineData = slide.timelineData.slice(0, 8);
        }
        if (slide.bigNumber && typeof slide.bigNumber === 'object') {
            clean.bigNumber = {
                number: String(slide.bigNumber.number || 'N/A'),
                label: String(slide.bigNumber.label || 'Statistic')
            };
        }
        return clean;
    });

    return cleaned.filter(s => s !== null);
}

// =====================================================================
// AI STRUCTURING WITH OPENAI (GPT-4) - With robust fallback
// =====================================================================
async function structureContentWithAI(rawContent, modeLabel, patientName, diagnosis) {
    if (!aiConfig.token) {
        const ok = await fetchTokens();
        if (!ok) {
            console.warn('No OpenAI token, using fallback structure');
            return createFallbackStructure(rawContent, modeLabel, patientName);
        }
    }

    const prompt = `You are an expert presentation designer. Transform the following clinical content into a structured presentation.

**RULES:**
1. NEVER change or paraphrase the original text. Preserve exact wording.
2. Each slide should have 4-6 bullet points with EXACT original text.
3. Split content into logical slides - each covers one clear topic.
4. Vary slide "type" across the deck (content, chart, comparison, timeline, big-number) where the data genuinely supports it — don't make every slide type "content".

**OUTPUT FORMAT**: Return ONLY a JSON array of slide objects.

Each slide object has:
{
  "title": string,
  "type": "content" | "chart" | "comparison" | "timeline" | "big-number",
  "bullets": array of strings (EXACT original text, 4-6 per slide),
  "chartData": { "type": "bar", "labels": [string], "datasets": [{ "label": string, "data": [number] }] },
  "comparisonData": { "left": [string], "right": [string] },
  "timelineData": [{ "time": string, "event": string }],
  "bigNumber": { "number": string, "label": string }
}

**Raw Content:**
${rawContent}

Return ONLY the JSON array.`;

    const messages = [
        { role: 'system', content: 'You are a presentation designer. Return ONLY valid JSON. NEVER change original text. Max 6 bullets per slide.' },
        { role: 'user', content: prompt }
    ];

    try {
        const url = `${aiConfig.endpoint}/chat/completions`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${aiConfig.token}`
            },
            body: JSON.stringify({
                model: aiConfig.model,
                messages,
                max_tokens: 6000,
                temperature: 0.1
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.warn('AI error:', errData);
            if (window.reportApiError) {
                window.reportApiError({
                    status: response.status,
                    bodyText: JSON.stringify(errData),
                    tool: 'ppt',
                    context: 'structure slides'
                });
            }
            return createFallbackStructure(rawContent, modeLabel, patientName);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.warn('No JSON found, using fallback');
            return createFallbackStructure(rawContent, modeLabel, patientName);
        }

        let slides = JSON.parse(jsonMatch[0]);
        const cleaned = validateAndCleanSlides(slides);
        if (!cleaned || cleaned.length === 0) {
            console.warn('Invalid slide structure, using fallback');
            return createFallbackStructure(rawContent, modeLabel, patientName);
        }
        return cleaned;
    } catch (error) {
        console.error('AI structuring error:', error);
        if (window.reportApiError) {
            window.reportApiError({
                bodyText: String(error && error.message || error),
                tool: 'ppt',
                context: 'structure slides (network/exception)'
            });
        }
        return createFallbackStructure(rawContent, modeLabel, patientName);
    }
}

function createFallbackStructure(rawContent, modeLabel, patientName) {
    const slides = [];
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = rawContent;

    let currentTitle = 'Introduction';
    let currentBullets = [];
    const children = tempDiv.children;

    for (let child of children) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
            if (currentBullets.length > 0) {
                slides.push({ title: currentTitle, type: 'content', bullets: currentBullets.slice(0, 6) });
                currentBullets = [];
            }
            currentTitle = child.textContent.trim() || 'Section';
        } else if (tag === 'ul' || tag === 'ol') {
            child.querySelectorAll('li').forEach(li => {
                const text = li.textContent.trim();
                if (text) currentBullets.push(text);
            });
        } else if (tag === 'p') {
            const text = child.textContent.trim();
            if (text && text.length > 10) currentBullets.push(text);
        }
    }

    if (currentBullets.length > 0) {
        slides.push({ title: currentTitle, type: 'content', bullets: currentBullets.slice(0, 6) });
    }

    if (slides.length === 0) {
        const paragraphs = rawContent.split(/\n\n+/).filter(p => p.trim().length > 20);
        paragraphs.forEach((p, index) => {
            const lines = p.split(/[.\n]+/).filter(s => s.trim().length > 10);
            if (lines.length > 0) {
                slides.push({ title: `Section ${index + 1}`, type: 'content', bullets: lines.slice(0, 6).map(s => s.trim()) });
            }
        });
    }

    if (slides.length === 0) {
        slides.push({ title: 'Clinical Presentation', type: 'content', bullets: ['Content could not be structured. Please check your document.'] });
    }

    return slides;
}

// =====================================================================
// COLOR HANDLING — THE CORE FIX
// PptxGenJS requires 6-digit hex with NO '#' and NO alpha baked in.
// The THEMES object above keeps '#' because it's also used as CSS for
// the on-page theme carousel. This function produces a PptxGenJS-safe
// copy right before we start building the deck.
// =====================================================================
function toPptColors(themeColors) {
    const out = {};
    for (const key in themeColors) {
        const val = themeColors[key];
        if (Array.isArray(val)) {
            out[key] = val.map(c => String(c).replace('#', '').toUpperCase());
        } else if (typeof val === 'string') {
            out[key] = val.replace('#', '').toUpperCase();
        } else {
            out[key] = val;
        }
    }
    // Muted light tints for text sitting on a dark/primary background —
    // replaces the old (invalid) rgba(255,255,255,x) approach.
    out.onDarkMuted = 'E8E8E8';
    out.onDarkFaint = 'C4C4C4';
    out.onDarkSubtle = '9E9E9E';
    return out;
}

// =====================================================================
// NATIVE TABLE (replaces the old hand-drawn grid of text boxes)
// =====================================================================
function addNativeTable(slide, data, colors, x, y, w) {
    if (!data || !Array.isArray(data) || data.length === 0) return;
    const rows = data.map((row, rIdx) => {
        const isHeader = rIdx === 0;
        return row.map(cell => ({
            text: String(cell || ''),
            options: {
                bold: isHeader,
                fontSize: isHeader ? 13 : 12,
                color: isHeader ? 'FFFFFF' : colors.text,
                fill: { color: isHeader ? colors.primary : 'FFFFFF' },
                align: 'left',
                valign: 'middle',
                fontFace: 'Arial'
            }
        }));
    });
    slide.addTable(rows, {
        x, y, w,
        border: { type: 'solid', color: 'E0E0E0', pt: 0.5 },
        autoPage: false,
        margin: 6
    });
}

// =====================================================================
// CHART
// =====================================================================
function addChartToSlide(slide, slideData, colors) {
    if (!slideData.chartData || !slideData.chartData.labels || !slideData.chartData.datasets) return;
    const { labels, datasets } = slideData.chartData;
    if (labels.length === 0 || datasets.length === 0) return;

    const chartData = [];
    const headerRow = ['Category'];
    labels.forEach(label => headerRow.push(String(label)));
    chartData.push(headerRow);

    datasets.forEach(dataset => {
        const row = [dataset.label || 'Series'];
        if (Array.isArray(dataset.data)) {
            dataset.data.forEach(val => row.push(typeof val === 'number' ? val : parseFloat(val) || 0));
        }
        chartData.push(row);
    });

    const chartColors = colors.chartColors || [colors.primary, colors.secondary, colors.accent, colors.primaryLight, colors.primaryDark];

    try {
        slide.addChart(slideData.chartData.type || 'bar', chartData, {
            x: 0.7, y: 1.9, w: 7.5, h: 4.3,
            chartColors,
            showTitle: false,
            showLegend: datasets.length > 1,
            legendPos: 'b',
            showValue: true,
            dataLabelPosition: 'outEnd',
            dataLabelColor: colors.text,
            dataLabelFontSize: 11,
            catAxisLabelColor: colors.text,
            valAxisLabelColor: colors.text,
            catAxisLabelFontSize: 12,
            valAxisLabelFontSize: 11,
            catAxisLineColor: 'E0E0E0',
            valAxisLineColor: 'E0E0E0',
            valGridLine: { color: 'EDEDED', style: 'solid', size: 0.75 },
            catGridLine: { style: 'none' }
        });
    } catch (e) {
        console.warn('Chart generation failed:', e);
    }
}

// =====================================================================
// COMPARISON — two clean cards, no top color-bar (avoids the
// "accent stripe" look), separated by generous whitespace instead.
// =====================================================================
function addComparisonSlide(slide, slideData, colors) {
    const left = slideData.comparisonData?.left || [];
    const right = slideData.comparisonData?.right || [];
    const colW = 5.6, gap = 0.5, startX = 0.7, top = 1.9, h = 4.6;

    const drawCard = (x, heading, headingColor, items) => {
        slide.addShape('roundRect', {
            x, y: top, w: colW, h,
            rectRadius: 0.12,
            fill: { color: 'FAFAFA' },
            line: { color: 'E5E5E5', width: 1 }
        });
        slide.addText(heading, {
            x: x + 0.35, y: top + 0.3, w: colW - 0.7, h: 0.5,
            fontSize: 18, bold: true, color: headingColor, fontFace: 'Arial', margin: 0
        });
        let yPos = top + 0.95;
        items.slice(0, 6).forEach(item => {
            slide.addText(item, {
                x: x + 0.35, y: yPos, w: colW - 0.7, h: 0.55,
                fontSize: 13.5, color: colors.text, fontFace: 'Arial',
                valign: 'top', bullet: { code: '25CF', indent: 14 }
            });
            yPos += 0.62;
        });
    };

    drawCard(startX, 'Before', colors.primary, left);
    drawCard(startX + colW + gap, 'After', colors.secondary || colors.primary, right);
}

// =====================================================================
// TIMELINE
// =====================================================================
function addTimelineSlide(slide, slideData, colors) {
    const timeline = slideData.timelineData || [];
    if (timeline.length === 0) return;

    const numItems = Math.min(timeline.length, 8);
    const usableWidth = 10.5;
    const spacing = usableWidth / numItems;
    const yPos = 3.6;
    const startX = 1.4;

    slide.addShape('rect', {
        x: startX, y: yPos, w: numItems * spacing, h: 0.03,
        fill: { color: 'D8D8D8' }, line: { type: 'none' }
    });

    timeline.slice(0, 8).forEach((item, idx) => {
        const xPos = startX + idx * spacing + spacing / 2 - 0.15;

        slide.addShape('ellipse', {
            x: xPos, y: yPos - 0.12, w: 0.3, h: 0.3,
            fill: { color: colors.primary },
            line: { color: 'FFFFFF', width: 1.5 }
        });
        slide.addText(item.time || '', {
            x: xPos - 0.75, y: yPos - 0.85, w: spacing, h: 0.45,
            fontSize: 13, color: colors.primary, align: 'center', bold: true, fontFace: 'Arial'
        });
        const eventText = String(item.event || '');
        slide.addText(eventText, {
            x: xPos - 0.85 - (spacing - 0.3) / 2, y: yPos + 0.35, w: spacing + 0.3, h: 0.9,
            fontSize: 11, color: colors.text, align: 'center', valign: 'top', fontFace: 'Arial', shrinkText: true
        });
    });
}

// =====================================================================
// BIG NUMBER
// =====================================================================
function addBigNumberSlide(slide, slideData, colors) {
    const bigNum = slideData.bigNumber || { number: 'N/A', label: 'Statistic' };

    slide.addText(String(bigNum.number), {
        x: 0.7, y: 1.7, w: 11.93, h: 2.2,
        fontSize: 96, color: colors.primary, align: 'center', bold: true, fontFace: 'Arial'
    });
    slide.addText(String(bigNum.label), {
        x: 0.7, y: 3.9, w: 11.93, h: 0.7,
        fontSize: 24, color: colors.text, align: 'center', fontFace: 'Arial'
    });

    if (slideData.bullets && slideData.bullets.length > 0) {
        let yPos = 4.9;
        slideData.bullets.slice(0, 3).forEach(bullet => {
            slide.addText(bullet, {
                x: 1.5, y: yPos, w: 10.33, h: 0.5,
                fontSize: 14, color: colors.text, fontFace: 'Arial',
                align: 'center', valign: 'top'
            });
            yPos += 0.55;
        });
    }
}

// =====================================================================
// GENERATE PPTX
// =====================================================================
async function generatePPTX() {
    if (!contentData) {
        showToast('No content to export.', 'error');
        return;
    }

    getDOMElements();

    if (generationStatus) {
        generationStatus.style.display = 'block';
        generationStatus.className = '';
        if (statusText) statusText.textContent = 'Preparing your presentation...';
    }
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    }

    try {
        const rawContent = contentData.content;
        const modeLabel = contentData.modeLabel || 'Clinical Presentation';
        const patientDisplay = contentData.patientName || 'N/A';
        const diagnosis = contentData.diagnosis || 'N/A';
        const profession = contentData.profession || 'N/A';

        if (statusText) statusText.textContent = 'Structuring content...';
        showToast('Structuring content...', 'info', 3000);

        let slides = await structureContentWithAI(rawContent, modeLabel, patientDisplay, diagnosis);
        if (!slides || !Array.isArray(slides) || slides.length === 0) {
            slides = createFallbackStructure(rawContent, modeLabel, patientDisplay);
        }
        structuredSlides = slides;

        // Extract tables from content
        const extractedTables = [];
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = rawContent;
        tempDiv.querySelectorAll('table').forEach(table => {
            const rows = [];
            table.querySelectorAll('tr').forEach(tr => {
                const cells = [];
                tr.querySelectorAll('td, th').forEach(td => cells.push(td.textContent.trim()));
                if (cells.length > 0) rows.push(cells);
            });
            if (rows.length > 0) extractedTables.push(rows);
        });

        updateSlideCount();
        if (statusText) statusText.textContent = 'Building PowerPoint...';

        const pptx = new PptxGenJS();
        pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
        pptx.layout = 'WIDE';

        // PptxGenJS-safe colors (no '#', no rgba) — this is the fix.
        const colors = toPptColors(selectedTheme.colors);
        const totalSlides = slides.length + 2 + (extractedTables.length > 0 ? 1 : 0);

        // -----------------------------------------------------------
        // TITLE SLIDE — solid dark background, no duplicate overlay,
        // no accent bars. Dark/light "sandwich" bookends the deck.
        // -----------------------------------------------------------
        const slideTitle = pptx.addSlide();
        slideTitle.background = { color: colors.primaryDark || colors.primary };

        slideTitle.addText(modeLabel, {
            x: 0.9, y: 1.5, w: 11.53, h: 1.6,
            fontSize: 42, color: 'FFFFFF', fontFace: 'Arial', bold: true, align: 'center'
        });
        slideTitle.addText(patientDisplay, {
            x: 0.9, y: 3.1, w: 11.53, h: 0.9,
            fontSize: 30, color: 'FFFFFF', fontFace: 'Arial', bold: true, align: 'center'
        });
        slideTitle.addText('Clinical Presentation', {
            x: 0.9, y: 4.0, w: 11.53, h: 0.55,
            fontSize: 17, color: colors.onDarkFaint, fontFace: 'Arial', italic: true, align: 'center'
        });
        const meta = [`Clinician: ${profession}`, `Diagnosis: ${diagnosis}`, `Date: ${new Date().toLocaleDateString()}`];
        slideTitle.addText(meta.join('   |   '), {
            x: 0.9, y: 4.75, w: 11.53, h: 0.5,
            fontSize: 13, color: colors.onDarkMuted, fontFace: 'Arial', align: 'center'
        });
        slideTitle.addText('Generated by rehablix', {
            x: 0, y: 6.95, w: 13.33, h: 0.4,
            fontSize: 10, color: colors.onDarkSubtle, align: 'center', fontFace: 'Arial'
        });

        // -----------------------------------------------------------
        // CONTENT SLIDES
        // -----------------------------------------------------------
        let slideIndex = 1;
        for (const slideData of slides) {
            const slide = pptx.addSlide();
            slide.background = { color: 'FFFFFF' };

            slide.addText(slideData.title || 'Section', {
                x: 0.7, y: 0.55, w: 11.93, h: 0.85,
                fontSize: 28, color: colors.headingColor || colors.primary,
                fontFace: 'Arial', bold: true, valign: 'middle', margin: 0
            });

            const type = slideData.type || 'content';
            const bullets = slideData.bullets || [];

            switch (type) {
                case 'chart':
                    if (slideData.chartData) addChartToSlide(slide, slideData, colors);
                    if (bullets.length > 0) {
                        let yPos = 1.9;
                        bullets.slice(0, 5).forEach(bullet => {
                            slide.addText(bullet, {
                                x: 8.5, y: yPos, w: 4.1, h: 0.7,
                                fontSize: 13, color: colors.text, fontFace: 'Arial',
                                valign: 'top', bullet: { code: '25CF', indent: 12 }
                            });
                            yPos += 0.78;
                        });
                    }
                    break;

                case 'comparison':
                    addComparisonSlide(slide, slideData, colors);
                    break;

                case 'timeline':
                    addTimelineSlide(slide, slideData, colors);
                    break;

                case 'big-number':
                    addBigNumberSlide(slide, slideData, colors);
                    break;

                default: {
                    const bulletCount = Math.min(bullets.length, 6);
                    if (bulletCount > 0) {
                        let yPos = 1.85;
                        const rowH = Math.min(0.85, 4.9 / bulletCount);
                        bullets.slice(0, bulletCount).forEach(bullet => {
                            slide.addText(bullet, {
                                x: 0.9, y: yPos, w: 11.53, h: rowH,
                                fontSize: 16, color: colors.text, fontFace: 'Arial',
                                valign: 'top', bullet: { code: '25CF', indent: 16 },
                                paraSpaceAfter: 8
                            });
                            yPos += rowH;
                        });
                    } else {
                        slide.addText('(No content available)', {
                            x: 0.9, y: 2.0, w: 11.53, h: 0.6,
                            fontSize: 15, color: colors.secondary || '999999',
                            fontFace: 'Arial', italic: true, valign: 'top'
                        });
                    }
                    break;
                }
            }

            const pageNum = slideIndex + 1;
            slide.addText(`${pageNum} / ${totalSlides}`, {
                x: 0, y: 7.15, w: 13.33, h: 0.3,
                fontSize: 9, color: '999999', align: 'center', fontFace: 'Arial'
            });
            slideIndex++;
        }

        // -----------------------------------------------------------
        // TABLE SLIDE (native table, not hand-drawn text boxes)
        // -----------------------------------------------------------
        if (extractedTables.length > 0) {
            const tableSlide = pptx.addSlide();
            tableSlide.background = { color: 'FFFFFF' };

            tableSlide.addText('Data Table', {
                x: 0.7, y: 0.55, w: 11.93, h: 0.85,
                fontSize: 28, color: colors.headingColor || colors.primary,
                fontFace: 'Arial', bold: true, valign: 'middle', margin: 0
            });

            addNativeTable(tableSlide, extractedTables[0], colors, 0.9, 1.85, 11.53);

            const pageNum = slideIndex + 1;
            tableSlide.addText(`${pageNum} / ${totalSlides}`, {
                x: 0, y: 7.15, w: 13.33, h: 0.3,
                fontSize: 9, color: '999999', align: 'center', fontFace: 'Arial'
            });
            slideIndex++;
        }

        // -----------------------------------------------------------
        // CLOSING SLIDE
        // -----------------------------------------------------------
        const thankSlide = pptx.addSlide();
        thankSlide.background = { color: colors.primaryDark || colors.primary };

        thankSlide.addText('Thank You', {
            x: 0.9, y: 2.3, w: 11.53, h: 1.6,
            fontSize: 50, color: 'FFFFFF', fontFace: 'Arial', bold: true, align: 'center'
        });
        thankSlide.addText(patientDisplay, {
            x: 0.9, y: 4.0, w: 11.53, h: 0.7,
            fontSize: 22, color: colors.onDarkMuted, fontFace: 'Arial', align: 'center'
        });
        thankSlide.addText('Generated with rehablix', {
            x: 0.9, y: 4.75, w: 11.53, h: 0.5,
            fontSize: 13, color: colors.onDarkSubtle, fontFace: 'Arial', align: 'center'
        });

        // -----------------------------------------------------------
        // DOWNLOAD
        // -----------------------------------------------------------
        const fileName = `${patientDisplay.replace(/\s+/g, '_')}_${modeLabel.replace(/\s+/g, '_')}_${Date.now()}.pptx`;
        await pptx.writeFile({ fileName });

        if (statusText) statusText.textContent = 'PowerPoint downloaded successfully!';
        if (generationStatus) generationStatus.className = 'success';
        showToast('PowerPoint downloaded successfully!');

    } catch (err) {
        console.error('Generation error:', err);
        if (statusText) statusText.textContent = 'Error: ' + err.message;
        if (generationStatus) generationStatus.className = 'error';
        showToast('Error generating PowerPoint: ' + err.message, 'error');
    } finally {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generate & Download';
        }
        setTimeout(() => {
            if (generationStatus) generationStatus.style.display = 'none';
        }, 5000);
    }
}

// =====================================================================
// EVENT LISTENERS
// =====================================================================
function setupEventListeners() {
    getDOMElements();

    document.querySelectorAll('input[name="artStyle"]').forEach(el => {
        el.addEventListener('change', (e) => {
            selectedArtStyle = e.target.value;
            document.querySelectorAll('.style-option').forEach(opt => opt.classList.remove('selected'));
            e.target.closest('.style-option').classList.add('selected');
            updateStepIndicator(2);
        });
    });

    if (generateBtn) generateBtn.addEventListener('click', () => generatePPTX());

    document.querySelectorAll('.step-item').forEach((item, index) => {
        item.addEventListener('click', () => {
            const cards = document.querySelectorAll('.ppt-card');
            if (cards[index]) cards[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement === generateBtn) generatePPTX();
});

if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged((user) => {
        currentUser = user;
        if (user) console.log('[PPT] User logged in:', user.email);
    });
}

async function init() {
    console.log('[PPT] Initializing...');
    await waitForDOM();
    getDOMElements();
    renderThemes();
    setupCarouselNav();

    const contentLoaded = loadContent();
    if (!contentLoaded && generateBtn) {
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> No content loaded';
    }

    setupEventListeners();
    updateStepIndicator(1);
    await fetchTokens();

    isInitialized = true;
    console.log('[PPT] Ready!');
}

init();
