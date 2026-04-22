/* ══════════════════════════════════════════════════════════════════════════
   MASTER TEMPLATE LOADER
   Loads quiz config + questions from JSON so the UI can stay identical.
   Supports:
   - root JSON files like 1.1.json
   - ./1.1.json
   - quizzes/1.1.json
   - full absolute URLs
   ══════════════════════════════════════════════════════════════════════════ */

var QUIZ_ID = 'public-1';
var QUIZ_TITLE = 'Quiz';
var DISPLAY_TITLE = 'Quiz';
var TOPIC_NAME = DISPLAY_TITLE;
var SHARE_URL = window.location.href;
var BACK_URL = 'index.html';
var MARKS_CORRECT = 2;
var MARKS_WRONG = -0.4;
var QPP = 1;
var SEO_TITLE = '';
var SEO_DESCRIPTION = '';
var SEO_KEYWORDS = '';
var OG_TITLE = '';
var OG_DESCRIPTION = '';
var CANONICAL_URL = '';
var TECHPSC_POINTS_PER_CORRECT = 1;

var timerInterval = null;
var timerSeconds = 0;
var timerRunning = false;
var quizData = [];
var MASTER_TEMPLATE_VERSION = '20260422-root-json-v2';

function deriveDisplayTitle(fullTitle) {
    var title = String(fullTitle || '').trim();
    if (!title) return 'Quiz';
    var colonIndex = title.indexOf(':');
    if (colonIndex > 0) return title.slice(0, colonIndex).trim();
    return title.length > 24 ? title.slice(0, 24).trim() : title;
}

function getRequestedQuizPath() {
    var params = new URLSearchParams(window.location.search);
    var raw =
        params.get('quiz') ||
        params.get('quizPath') ||
        document.body.getAttribute('data-default-quiz') ||
        '';
    raw = String(raw || '').trim();
    if (!raw) {
        throw new Error('Missing quiz JSON path. Open this page with ?quiz=...');
    }
    return raw;
}

function getQuizSystemBaseUrl() {
    return new URL('./', window.location.href);
}

function pushUniqueCandidate(list, seen, href) {
    if (!href || seen[href]) return;
    seen[href] = true;
    list.push(new URL(href));
}

function addCandidatePath(list, seen, path) {
    var cleaned = String(path || '').trim();
    if (!cleaned) return;

    var origin = window.location.origin;
    var baseUrl = getQuizSystemBaseUrl();

    if (/^https?:\/\//i.test(cleaned)) {
        pushUniqueCandidate(list, seen, cleaned);
        return;
    }

    var bare = cleaned
        .replace(/^[.]\//, '')
        .replace(/^\/+/, '');

    if (!bare) return;

    if (bare.indexOf('quiz-system/') === 0) {
        pushUniqueCandidate(list, seen, origin + '/' + bare);
        pushUniqueCandidate(list, seen, new URL(bare.replace(/^quiz-system\//, ''), baseUrl).href);
        return;
    }

    if (bare.indexOf('quizzes/') === 0) {
        pushUniqueCandidate(list, seen, new URL(bare, baseUrl).href);
        pushUniqueCandidate(list, seen, origin + '/' + bare);
        return;
    }

    // Root-level file first: /4th-mechanics/1.1.json
    pushUniqueCandidate(list, seen, new URL(bare, baseUrl).href);

    // Absolute origin fallback: /1.1.json
    pushUniqueCandidate(list, seen, origin + '/' + bare);

    // Legacy quizzes/ fallback
    pushUniqueCandidate(list, seen, new URL('quizzes/' + bare, baseUrl).href);
    pushUniqueCandidate(list, seen, origin + '/quizzes/' + bare);
}

function buildLegacyAliasPaths(bare) {
    var aliases = [];
    var clean = String(bare || '')
        .trim()
        .replace(/^\/+/, '')
        .replace(/^quiz-system\//, '');

    if (!clean) return aliases;

    var parts = clean.split('/');
    if (parts[0] !== 'quizzes') return aliases;

    var top = parts[1] || '';
    var second = parts[2] || '';
    var tail = parts.slice(3).join('/');

    if (!top) return aliases;

    if (top === 'mock-test' || top === 'mock-tests' || top === 'subjects') {
        if (second && tail) aliases.push('quizzes/' + second + '/' + tail);
        if ((top === 'mock-test' || top === 'mock-tests') && second === 'civil' && tail) {
            aliases.push('quizzes/civils/' + tail);
        }
        return aliases;
    }

    if (top === 'civils') {
        if (second) {
            aliases.push('quizzes/civil/' + second);
            aliases.push('quizzes/mock-test/civil/' + second);
            aliases.push('quizzes/subjects/civil/' + second);
        }
        return aliases;
    }

    if (second) {
        aliases.push('quizzes/mock-test/' + top + '/' + second);
        aliases.push('quizzes/subjects/' + top + '/' + second);
    }

    return aliases;
}

function buildQuizUrlCandidates(raw) {
    var requested = String(raw || '').trim();
    var list = [];
    var seen = Object.create(null);

    addCandidatePath(list, seen, requested);

    var bare = requested
        .replace(/^[.]\//, '')
        .replace(/^\/+/, '')
        .replace(/^quiz-system\//, '');

    if (bare.indexOf('quizzes/mock-tests/') === 0) {
        addCandidatePath(list, seen, bare.replace('quizzes/mock-tests/', 'quizzes/mock-test/'));
    }
    if (bare.indexOf('quizzes/mock-test/') === 0) {
        addCandidatePath(list, seen, bare.replace('quizzes/mock-test/', 'quizzes/mock-tests/'));
    }

    buildLegacyAliasPaths(bare).forEach(function (aliasPath) {
        addCandidatePath(list, seen, aliasPath);
    });

    return list;
}

function formatCandidateSummary(candidates) {
    return candidates.map(function (candidate) {
        return candidate.pathname;
    }).join(' | ');
}

function normalizeQuizPayload(payload) {
    if (Array.isArray(payload)) {
        return { config: {}, questions: payload };
    }
    if (payload && Array.isArray(payload.questions)) {
        return { config: payload.config || payload.meta || {}, questions: payload.questions };
    }
    if (payload && Array.isArray(payload.quizData)) {
        return { config: payload.config || payload.meta || {}, questions: payload.quizData };
    }
    if (payload && Array.isArray(payload.mcqs)) {
        return { config: payload.config || payload.meta || {}, questions: payload.mcqs };
    }
    return {
        config: payload && (payload.config || payload.meta || {}) || {},
        questions: []
    };
}

function applyQuizConfig(config, resolvedUrl) {
    var cfg = config || {};

    QUIZ_ID = String(cfg.quizId || cfg.id || resolvedUrl.pathname || 'public-1')
        .replace(/[^a-z0-9_-]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'public-1';

    QUIZ_TITLE = String(cfg.quizTitle || cfg.title || 'Quiz');
    DISPLAY_TITLE = String(cfg.displayTitle || cfg.topicName || deriveDisplayTitle(QUIZ_TITLE));
    TOPIC_NAME = DISPLAY_TITLE;
    SHARE_URL = String(cfg.shareUrl || resolvedUrl.href || window.location.href);
    BACK_URL = String(cfg.backUrl || 'index.html');
    MARKS_CORRECT = Number.isFinite(Number(cfg.marksCorrect)) ? Number(cfg.marksCorrect) : 2;
    MARKS_WRONG = Number.isFinite(Number(cfg.marksWrong)) ? Number(cfg.marksWrong) : -0.4;
    QPP = Number.isFinite(Number(cfg.questionsPerPage || cfg.qpp)) && Number(cfg.questionsPerPage || cfg.qpp) > 0
        ? Math.floor(Number(cfg.questionsPerPage || cfg.qpp))
        : 1;

    SEO_TITLE = String(cfg.seoTitle || (QUIZ_TITLE + ' MCQ Quiz | TechPSC Nepal'));
    SEO_DESCRIPTION = String(cfg.seoDescription || ('Practice ' + QUIZ_TITLE + ' MCQs for free on TechPSC Nepal.'));
    SEO_KEYWORDS = String(cfg.seoKeywords || (QUIZ_TITLE + ', GK MCQ, Prabidhik, Lok Sewa, TechPSC Nepal'));
    OG_TITLE = String(cfg.ogTitle || (QUIZ_TITLE + ' MCQ Quiz | TechPSC Nepal'));
    OG_DESCRIPTION = String(cfg.ogDescription || SEO_DESCRIPTION);
    CANONICAL_URL = String(cfg.canonicalUrl || SHARE_URL);
    TECHPSC_POINTS_PER_CORRECT = Number.isFinite(Number(cfg.techpscPointsPerCorrect))
        ? Number(cfg.techpscPointsPerCorrect)
        : 1;

    var allTopicsLink = document.querySelector('.sc-btn-ghost');
    if (allTopicsLink) allTopicsLink.setAttribute('href', BACK_URL);

    var ebTotal = document.getElementById('ebTotal');
    if (ebTotal) ebTotal.textContent = String(quizData.length || 0);
}

function renderLoadError(message) {
    var container = document.getElementById('qContainer');
    var detail = String(message || 'Please check the quiz JSON path and try again.')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

    if (container) {
        container.innerHTML =
            '<div class="qcard" style="padding-top:10px">' +
                '<div style="background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:22px;box-shadow:var(--shadow-sm)">' +
                    '<div style="font-size:12px;font-weight:800;color:var(--err);letter-spacing:.08em;text-transform:uppercase">Quiz Load Error</div>' +
                    '<div style="font-size:20px;font-weight:800;letter-spacing:-.03em;margin-top:8px">Could not load this quiz.</div>' +
                    '<div style="font-size:14px;color:var(--text-muted);margin-top:10px;line-height:1.7">' + detail + '</div>' +
                '</div>' +
            '</div>';
    }

    var bar = document.getElementById('bottomIsland');
    if (bar) bar.style.display = 'none';
}

function loadQuizPayload() {
    var raw;
    try {
        raw = getRequestedQuizPath();
    } catch (error) {
        return Promise.reject(error);
    }

    document.body.setAttribute('data-quiz-requested', raw);
    document.body.setAttribute('data-master-template-version', MASTER_TEMPLATE_VERSION);

    var candidates = buildQuizUrlCandidates(raw);
    if (!candidates.length) {
        return Promise.reject(new Error('Could not derive a valid quiz JSON path from: ' + raw));
    }

    console.log('MASTER_TEMPLATE_VERSION:', MASTER_TEMPLATE_VERSION);
    console.log('Master template candidate URLs:', candidates.map(function (candidate) {
        return candidate.href;
    }));

    var lastError = null;

    function tryCandidate(index) {
        if (index >= candidates.length) {
            var detail =
                (lastError ? lastError + '\n' : '') +
                'Requested: ' + raw + '\n' +
                'Tried: ' + formatCandidateSummary(candidates);

            return Promise.reject(new Error(detail));
        }

        var resolvedUrl = candidates[index];

        return fetch(resolvedUrl.href, { cache: 'no-store' })
            .then(function (response) {
                if (!response.ok) {
                    lastError = 'HTTP ' + response.status + ' while loading ' + resolvedUrl.pathname;
                    return tryCandidate(index + 1);
                }

                return response.json().then(function (payload) {
                    var normalized = normalizeQuizPayload(payload);
                    quizData = normalized.questions;

                    if (!quizData.length) {
                        throw new Error('Quiz JSON contains no questions');
                    }

                    applyQuizConfig(normalized.config, resolvedUrl);

                    var totalNode = document.getElementById('ebTotal');
                    if (totalNode) totalNode.textContent = String(quizData.length);

                    console.log('Master template quiz loaded:', resolvedUrl.href, quizData.length, 'questions');
                });
            })
            .catch(function (error) {
                lastError = error && error.message ? error.message : String(error);
                return tryCandidate(index + 1);
            });
    }

    return tryCandidate(0);
}
