
/* ══════════════════════════════════════════════════════════════════════════
   MASTER TEMPLATE LOADER
   Loads quiz config + questions from JSON so the UI can stay identical.
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
var MASTER_TEMPLATE_VERSION = '20260405d';

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
        return;
    }

    if (bare.indexOf('quizzes/') === 0) {
        pushUniqueCandidate(list, seen, new URL(bare, baseUrl).href);
        pushUniqueCandidate(list, seen, origin + '/' + bare);
        return;
    }

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
    return candidates.map(function (candidate) { return candidate.pathname; }).join(' | ');
}

function normalizeQuizPayload(payload) {
    if (Array.isArray(payload)) return { config: {}, questions: payload };
    if (payload && Array.isArray(payload.questions)) return { config: payload.config || payload.meta || {}, questions: payload.questions };
    if (payload && Array.isArray(payload.quizData)) return { config: payload.config || payload.meta || {}, questions: payload.quizData };
    if (payload && Array.isArray(payload.mcqs)) return { config: payload.config || payload.meta || {}, questions: payload.mcqs };
    return { config: payload && (payload.config || payload.meta || {}) || {}, questions: [] };
}

function applyQuizConfig(config, resolvedUrl) {
    var cfg = config || {};
    QUIZ_ID = String(cfg.quizId || cfg.id || resolvedUrl.pathname || 'public-1').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'public-1';
    QUIZ_TITLE = String(cfg.quizTitle || cfg.title || 'Quiz');
    DISPLAY_TITLE = String(cfg.displayTitle || cfg.topicName || deriveDisplayTitle(QUIZ_TITLE));
    TOPIC_NAME = DISPLAY_TITLE;
    SHARE_URL = String(cfg.shareUrl || resolvedUrl.href || window.location.href);
    BACK_URL = String(cfg.backUrl || 'index.html');
    MARKS_CORRECT = Number.isFinite(Number(cfg.marksCorrect)) ? Number(cfg.marksCorrect) : 2;
    MARKS_WRONG = Number.isFinite(Number(cfg.marksWrong)) ? Number(cfg.marksWrong) : -0.4;
    QPP = Number.isFinite(Number(cfg.questionsPerPage || cfg.qpp)) && Number(cfg.questionsPerPage || cfg.qpp) > 0 ? Math.floor(Number(cfg.questionsPerPage || cfg.qpp)) : 1;
    SEO_TITLE = String(cfg.seoTitle || (QUIZ_TITLE + ' MCQ Quiz | All survey MCQ | TechPSC Nepal'));
    SEO_DESCRIPTION = String(cfg.seoDescription || ('Practice ' + QUIZ_TITLE + ' MCQs for free on TechPSC Nepal.'));
    SEO_KEYWORDS = String(cfg.seoKeywords || (QUIZ_TITLE + ', GK MCQ, Prabidhik, Lok Sewa, TechPSC Nepal'));
    OG_TITLE = String(cfg.ogTitle || (QUIZ_TITLE + ' MCQ Quiz | TechPSC Nepal'));
    OG_DESCRIPTION = String(cfg.ogDescription || SEO_DESCRIPTION);
    CANONICAL_URL = String(cfg.canonicalUrl || SHARE_URL);
    TECHPSC_POINTS_PER_CORRECT = Number.isFinite(Number(cfg.techpscPointsPerCorrect)) ? Number(cfg.techpscPointsPerCorrect) : 1;

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

    console.log('Master template candidate URLs:', candidates.map(function (candidate) { return candidate.href; }));

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


/* ══════════════════════════════════════════════════════════════════════════
           QUIZ ENGINE - DO NOT MODIFY BELOW THIS LINE
           ══════════════════════════════════════════════════════════════════════════ */
        var userAnswers = {};
        var quizFinished = false;
        var mode = 'practice', examSubmitted = false, quizDirty = false, readingMode = false;
        var correctCount = 0, wrongCount = 0, streak = 0, totalScore = 0, xp = 0;
        var currentPage = 1, L = ['A', 'B', 'C', 'D'];
        var comboWords = ['Nice!', 'Good!', 'Great!', 'Amazing!', 'On Fire!', 'Unstoppable!', 'GODLIKE!'];

        /* TIMER FUNCTIONS */
        function startTimer() {
            if (timerRunning) return;
            timerRunning = true;
            timerInterval = setInterval(function() {
                timerSeconds++;
                updateTimerDisplay();
            }, 1000);
        }

        function stopTimer() {
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            timerRunning = false;
        }

        function resetTimer() {
            stopTimer();
            timerSeconds = 0;
            updateTimerDisplay();
        }

        function updateTimerDisplay() {
            var minutes = Math.floor(timerSeconds / 60);
            var seconds = timerSeconds % 60;
            var formatted = (minutes < 10 ? '0' : '') + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
            document.getElementById('timerDisplay').textContent = formatted;
        }

        function getElapsedTime() {
            var minutes = Math.floor(timerSeconds / 60);
            var seconds = timerSeconds % 60;
            return (minutes < 10 ? '0' : '') + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
        }

        /* EXIT */
        var pendingExit = 'index.html';
        function tryExit() {
            if (!quizDirty) { window.location.href = BACK_URL; return; }
            pendingExit = BACK_URL;
            document.getElementById('exitCount').textContent = Object.keys(userAnswers).filter(function (k) { return userAnswers[k] !== -1 }).length;
            document.getElementById('exitTotal').textContent = quizData.length;
            document.getElementById('exitOverlay').classList.add('show');
        }
        function closeExitModal() { document.getElementById('exitOverlay').classList.remove('show'); }
        function confirmExit() { 
            stopTimer(); // Stop timer on exit
            quizDirty = false; 
            window.location.href = pendingExit; 
        }
        window.addEventListener('beforeunload', function (e) { if (quizDirty) { e.preventDefault(); e.returnValue = ''; } });
        window.addEventListener('popstate', function (e) { if (quizDirty) { e.preventDefault(); history.pushState(null, '', location.href); tryExit(); } });
        history.pushState(null, '', location.href);
        document.addEventListener('click', function (e) {
            if (!quizDirty) return; var a = e.target.closest('a[href]');
            if (a && !a.closest('.scorecard') && !a.closest('.exit-overlay')) { e.preventDefault(); pendingExit = a.href; tryExit(); }
        }, true);

        function haptic(t) { try { if (navigator.vibrate) { if (t === 'ok') navigator.vibrate(25); else if (t === 'err') navigator.vibrate([15, 40, 15]); else navigator.vibrate(12); } } catch (e) { } }

        function setThemeIcons(isDark){
            var sun=document.getElementById('iconSun'),moon=document.getElementById('iconMoon');
            if(sun)sun.style.display=isDark?'none':'block';
            if(moon)moon.style.display=isDark?'block':'none';
        }
        function setMetaContent(id, value) {
            var el = document.getElementById(id);
            if (el && value) el.setAttribute('content', value);
        }
        function setLinkHref(id, value) {
            var el = document.getElementById(id);
            if (el && value) el.setAttribute('href', value);
        }
        function getDisplayTitle() {
            var shortTitle = (DISPLAY_TITLE || TOPIC_NAME || '').trim();
            if (shortTitle) return shortTitle;
            var fullTitle = (QUIZ_TITLE || '').trim();
            if (!fullTitle) return 'Quiz';
            var colonIndex = fullTitle.indexOf(':');
            if (colonIndex > 0) return fullTitle.slice(0, colonIndex).trim();
            return fullTitle.length > 24 ? fullTitle.slice(0, 24).trim() : fullTitle;
        }
        function syncPageMeta() {
            var fullTitle = (QUIZ_TITLE || 'Quiz').trim();
            var seoTitle = (SEO_TITLE || (fullTitle + ' MCQ Quiz | All survey MCQ | TechPSC Nepal')).trim();
            var seoDescription = (SEO_DESCRIPTION || ('Practice ' + fullTitle + ' MCQs for free on TechPSC Nepal.')).trim();
            var seoKeywords = (SEO_KEYWORDS || (fullTitle + ', GK MCQ, Prabidhik, Lok Sewa, TechPSC Nepal')).trim();
            var ogTitle = (OG_TITLE || (fullTitle + ' MCQ Quiz | TechPSC Nepal')).trim();
            var ogDescription = (OG_DESCRIPTION || seoDescription).trim();
            var canonicalUrl = (CANONICAL_URL || SHARE_URL || location.href).trim();
            document.title = seoTitle;
            setMetaContent('metaDescription', seoDescription);
            setMetaContent('metaKeywords', seoKeywords);
            setMetaContent('ogTitle', ogTitle);
            setMetaContent('ogDescription', ogDescription);
            setMetaContent('ogUrl', canonicalUrl);
            setLinkHref('canonicalLink', canonicalUrl);
        }
        function initTheme() {
            var h=document.documentElement,m=document.getElementById('themeColor'),b=document.getElementById('themeToggle');
            var themeKey='tp_quiz_master_theme_v2';
            var s=localStorage.getItem(themeKey),dk=s?s==='dark':true;
            h.setAttribute('data-theme',dk?'dark':'light');
            m.content=dk?'#000000':'#ffffff';
            setThemeIcons(dk);
            b.onclick=function(){
                haptic('tap');
                var c=h.getAttribute('data-theme'),n=c==='dark'?'light':'dark';
                h.setAttribute('data-theme',n);
                localStorage.setItem(themeKey,n);
                m.content=n==='dark'?'#000000':'#ffffff';
                setThemeIcons(n==='dark');
            };
        }

        function fmtMarks(v) { return v % 1 === 0 ? v : v.toFixed(1) }
        function updateMarks() {
            document.getElementById('marksNum').textContent = fmtMarks(totalScore);
            var p = document.getElementById('marksPill'); p.classList.remove('pop'); void p.offsetWidth; p.classList.add('pop');
        }
        function updateModeControls() {
            var started = Object.keys(userAnswers).length > 0;
            var practiceBtn = document.getElementById('practiceBtn');
            var examBtn = document.getElementById('examBtn');
            var practiceLocked = readingMode || (mode === 'exam' && started);
            var examLocked = readingMode || (mode === 'practice' && started);
            var readingLocked = readingMode || started;
            document.querySelectorAll('.mbtn').forEach(function (b) {
                b.classList.toggle('active', b.dataset.mode === mode);
            });
            if (practiceBtn) {
                practiceBtn.disabled = practiceLocked;
                practiceBtn.title = practiceLocked ? 'Restart session to return to practice' : 'Practice mode';
            }
            if (examBtn) {
                examBtn.disabled = examLocked;
                examBtn.title = examLocked ? 'Restart session to switch to exam' : 'Exam mode';
            }
            var slider = document.getElementById('modeSlider');
            if (slider) slider.classList.toggle('right', mode === 'exam');
            var readingBtn = document.getElementById('readingBtn');
            if (readingBtn) {
                readingBtn.classList.toggle('active', readingMode);
                readingBtn.disabled = readingLocked;
                readingBtn.style.pointerEvents = readingLocked ? 'none' : '';
                readingBtn.setAttribute('aria-disabled', readingLocked ? 'true' : 'false');
                readingBtn.title = readingLocked
                    ? 'Restart session to use reading mode'
                    : 'Show answers for study mode';
            }
        }
        function updatePrimaryActionButton() {
            var btn = document.getElementById('shuffleBtn');
            if (!btn) return;
            var started = Object.keys(userAnswers).length > 0;
            var useRestart = readingMode || started;
            if (useRestart) {
                btn.innerHTML =
                    '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                    '<path d="M21 12a9 9 0 1 1-2.64-6.36"/>' +
                    '<path d="M21 3v6h-6"/>' +
                    '</svg><span>Restart</span>';
                btn.onclick = resetQuiz;
                btn.disabled = false;
                btn.setAttribute('aria-disabled', 'false');
                btn.setAttribute('aria-label', 'Restart quiz session');
                btn.title = readingMode ? 'Restart reading session' : 'Restart current session';
            } else {
                btn.innerHTML =
                    '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                    '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/>' +
                    '<path d="m18 2 4 4-4 4"/>' +
                    '<path d="M2 6h1.9c1.5 0 2.9.9 3.5 2.2"/>' +
                    '<path d="M22 18h-5.9c-1.3 0-2.5-.7-3.1-1.8l-.3-.5"/>' +
                    '<path d="m18 14 4 4-4 4"/>' +
                    '</svg><span>Shuffle</span>';
                btn.onclick = shuffleAndReset;
                btn.disabled = false;
                btn.setAttribute('aria-disabled', 'false');
                btn.setAttribute('aria-label', 'Shuffle quiz questions');
                btn.title = 'Shuffle quiz questions';
            }
        }
        function updateBottomAction() {
            var btn = document.getElementById('botNextBtn');
            var label = document.getElementById('botNextLabel');
            if (!btn || !label) return;
            var atEnd = currentPage >= getTotalPages();
            if (readingMode && atEnd && !quizFinished) {
                label.textContent = 'Restart Quiz';
                btn.classList.add('restart-mode');
                btn.setAttribute('aria-label', 'Restart quiz after reading mode');
            } else {
                label.textContent = 'Continue';
                btn.classList.remove('restart-mode');
                btn.setAttribute('aria-label', 'Continue');
            }
        }
        function addXP(amt, isPos) {
            xp = Math.max(0, xp + amt); document.getElementById('xpNum').textContent = xp;
            var p = document.getElementById('xpPill'); if(p){p.classList.remove('pop'); void p.offsetWidth; p.classList.add('pop');}
            var f = document.createElement('div'); f.className = 'xp-float ' + (isPos ? 'pos' : 'neg');
            f.textContent = (amt >= 0 ? '+' : '') + amt + ' XP'; f.style.left = '50%'; f.style.top = '38%'; f.style.transform = 'translateX(-50%)';
            document.body.appendChild(f); requestAnimationFrame(function () { f.classList.add('show'); });
            setTimeout(function () { f.remove(); }, 950);
        }
        function showCombo() {
            if (streak < 2) return; var i = Math.min(streak - 2, comboWords.length - 1);
            var p = document.getElementById('comboPopup'); if(p){document.getElementById('comboNum').textContent = streak + 'x'; document.getElementById('comboLabel').textContent = comboWords[i]; p.classList.remove('show'); void p.offsetWidth; p.classList.add('show'); setTimeout(function(){p.classList.remove('show');},750);}
        }

        function getTotalPages() { return Math.ceil(quizData.length / QPP) || 1 }
        function render() {
            if(quizFinished){document.getElementById('qContainer').innerHTML='';return;}
            var i = currentPage - 1;
            if (i >= quizData.length) { document.getElementById('qContainer').innerHTML = ''; updateProgress(); return; }
            var q = quizData[i], ua = userAnswers[i], ca = q.answer;
            var answered = (ua !== undefined && ua !== -1), skipped = (ua === -1);
            var reveal = readingMode || (mode === 'practice' && (answered || skipped)) || (mode === 'exam' && examSubmitted && answered);
            var cls = 'qcard'; if (reveal && answered) cls += ua === ca ? ' bc' : ' bw';
            var h = '<div class="' + cls + '"><div class="qhead">';
            h += '<div class="qnum-col"><div class="qnum-n">' + (i+1) + '</div><div class="qnum-of">/' + quizData.length + '</div></div>';
            h += '<div class="qnum-divider"></div>';
            h += '<div class="q-meta"><div class="qtext">' + q.q + '</div></div>';
            h += '</div><div class="opts">';
            q.options.forEach(function (o, oi) {
                var c = 'opt', mk = L[oi], isC = (oi === ca), isW = (oi === ua && ua !== ca), icon = '';
                if (reveal) { c += ' disabled'; if (isC) { c += mode === 'practice' ? ' sc' : ' ec'; mk = '✓'; icon = '✅'; } else if (isW) { c += mode === 'practice' ? ' sw' : ' ew'; mk = '✗'; icon = '❌'; } }
                else if (mode === 'exam' && ua === oi) { c += ' sel'; }
                if (reveal && isC && q.explanation) {
                    h += '<div class="' + c + '" onclick="selectOpt(' + i + ',' + oi + ')" style="flex-wrap:wrap"><div style="display:flex;align-items:center;gap:10px;width:100%"><div class="odot">' + mk + '</div><div class="olabel">' + o + '</div><div class="opt-icon">' + icon + '</div></div>';
                    h += '<div class="oexpl show"><span style="flex-shrink:0;font-size:12px">💡</span><span>' + q.explanation + '</span></div></div>';
                } else {
                    h += '<div class="' + c + '" onclick="selectOpt(' + i + ',' + oi + ')"><div class="odot">' + mk + '</div><div class="olabel">' + o + '</div>';
                    if (icon) h += '<div class="opt-icon">' + icon + '</div>'; h += '</div>';
                }
            });
            h += '</div>';
            if (!readingMode && !answered && mode === 'practice') h += '<button class="show-ans-btn" onclick="showAns(' + i + ')">👁️ View Answer</button>';
            h += '</div>';
            document.getElementById('qContainer').innerHTML = h;
            updateProgress(); updateExamBanner();
            updateBottomAction();
            document.getElementById('hSub').textContent = currentPage + '/' + quizData.length;
        }
        function goToPage(pg) { var tp = getTotalPages(); if (pg < 1 || pg > tp) return; currentPage = pg; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

        /* ══════════════════════════════════════════════════════════════════════════
           selectOpt() - HANDLES ANSWER SELECTION WITH TECHPSC INTEGRATION
           ══════════════════════════════════════════════════════════════════════════ */
        function selectOpt(qi, oi) {
            if (readingMode) { showToast('Reading mode is locked until reset'); return; }
            if (mode === 'exam' && !examSubmitted) { userAnswers[qi] = oi; quizDirty = true; haptic('tap'); render(); saveStorage(); return; }
            if (mode === 'practice') {
                if (userAnswers[qi] !== undefined) return;
                userAnswers[qi] = oi; quizDirty = true;
                var ca = quizData[qi].answer;
                if (oi === ca) {
                    correctCount++; totalScore += MARKS_CORRECT; streak++;
                    addXP(10 + Math.min(streak - 1, 5) * 2, true); haptic('ok'); showCombo(); updateStreak(); updateMarks();
                    
                    /* ══════════════════════════════════════════════════════════════
                       TECHPSC: Send points to Android app when answer is correct
                       ══════════════════════════════════════════════════════════════ */
                    if (typeof TechPSC !== 'undefined') {
                        TechPSC.onCorrectAnswer(TECHPSC_POINTS_PER_CORRECT);
                    }
                    
                    if (typeof confetti !== 'undefined' && streak >= 3) confetti({ particleCount: 20 + streak * 6, spread: 40 + streak * 5, origin: { y: .65 }, disableForReducedMotion: true, colors: ['#2f9e44', '#40c057', '#8ce99a', '#ffe066'] });
                } else {
                    wrongCount++; totalScore += MARKS_WRONG; streak = 0;
                    addXP(-3, false); haptic('err'); updateStreak(); updateMarks();
                    var card = document.querySelector('.qcard'); if (card) { card.style.animation = 'wrongShake .4s ease'; setTimeout(function () { card.style.animation = ''; }, 450); }
                }
                render(); saveStorage();
                // setTimeout(function () { if (currentPage < getTotalPages()) goToPage(currentPage + 1); }, 10000);
            }
        }
        
        function showAns(qi) {
            if (readingMode) { showToast('Reading mode is already active'); return; }
            userAnswers[qi] = -1; render();
        }
        function updateStreak() { document.getElementById('streakNum').textContent = streak; var p = document.getElementById('streakPill'); if(p){p.classList.remove('pop'); void p.offsetWidth; if(streak > 0) p.classList.add('pop');} }
        function getAnsweredCount() { return Object.keys(userAnswers).filter(function (k) { return userAnswers[k] !== -1 }).length; }
        function activateReadingMode() {
            if (readingMode) { showToast('Reading mode already active'); return; }
            var started = Object.keys(userAnswers).length > 0;
            if (mode === 'exam' && started) { showToast('Restart to use reading'); return; }
            if (mode === 'practice' && started) { showToast('Restart to use reading'); return; }
            if (mode === 'exam') mode = 'practice';
            readingMode = true;
            examSubmitted = false;
            haptic('tap');
            updateModeControls();
            render();
            saveStorage();
            showToast('Reading mode locked until reset');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        function updateShuffleButton() {
            updatePrimaryActionButton();
        }
        function updateProgress() { var a = getAnsweredCount(); document.getElementById('progFill').style.width = (quizData.length > 0 ? (a / quizData.length) * 100 : 0) + '%'; }
        function updateExamBanner() {
            var wrap = document.getElementById('examBannerWrap');
            var b = document.getElementById('examBanner');
            if (wrap) wrap.style.display = 'none';
            if (b) b.classList.remove('show');
            updateModeControls();
            updateShuffleButton();
        }
        function handleNext() {
            var tp = getTotalPages();
            if (currentPage < tp) goToPage(currentPage + 1);
            else if (readingMode) resetQuiz();
            else if (mode === 'exam' && !examSubmitted) submitExam();
            else finishQuiz();
        }

        function setMode(m) {
            if (readingMode) { showToast('Reading mode stays on until reset'); return; }
            if (mode === 'exam' && Object.keys(userAnswers).length > 0 && m === 'practice') { showToast('Restart to switch from exam'); return; }
            if (mode === 'practice' && Object.keys(userAnswers).length > 0 && m === 'exam') { showToast('Restart to switch to exam'); return; }
            mode = m;
            examSubmitted = false;
            updateModeControls();
            haptic('tap');
            if(!quizFinished){render();}
            showToast(m === 'exam' ? 'Exam Mode' : 'Practice Mode');
        }

        /* ══════════════════════════════════════════════════════════════════════════
           submitExam() - HANDLES EXAM SUBMISSION WITH TECHPSC INTEGRATION
           ══════════════════════════════════════════════════════════════════════════ */
        function submitExam() {
            stopTimer(); // Stop timer on exam submit
            examSubmitted = true; correctCount = 0; wrongCount = 0; totalScore = 0; xp = 0;
            quizData.forEach(function (q, i) { var ua = userAnswers[i]; if (ua !== undefined && ua !== -1) { if (ua === q.answer) { correctCount++; totalScore += MARKS_CORRECT; xp += 10; } else { wrongCount++; totalScore += MARKS_WRONG; } } });
            streak = correctCount; document.getElementById('streakNum').textContent = streak; document.getElementById('xpNum').textContent = xp; updateMarks();
            
            /* ══════════════════════════════════════════════════════════════════════
               TECHPSC: Send exam results to Android app
               ══════════════════════════════════════════════════════════════════════ */
            if (typeof TechPSC !== 'undefined') {
                TechPSC.onQuizComplete(correctCount, quizData.length);
            }
            
            showToast('📋 Submitted!'); setTimeout(finishQuiz, 500);
        }

        function shuffleQ() { for (var i = quizData.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = quizData[i]; quizData[i] = quizData[j]; quizData[j] = t; } }
        function resetQuiz() {
            stopTimer(); // Stop current timer
            var resetMode = mode;
            userAnswers = {}; correctCount = 0; wrongCount = 0; streak = 0; totalScore = 0; xp = 0;
            currentPage = 1; examSubmitted = false; quizDirty = false; readingMode = false; mode = resetMode; shuffleQ();
            document.body.classList.remove('result-mode');
            document.getElementById('scoreCard').classList.remove('show');
            document.getElementById('streakNum').textContent = 0; document.getElementById('xpNum').textContent = 0; document.getElementById('marksNum').textContent = 0;
            resetTimer(); // Reset and restart timer
            startTimer(); // Start fresh timer
            quizFinished = false;
            var sg = document.getElementById('scSceneGlow'); if(sg) sg.classList.remove('show');
            document.getElementById('ctrlBar').style.display = '';
            document.getElementById('bottomIsland').style.display = '';
            document.getElementById('examBannerWrap').style.display = 'none';
            updateModeControls();
            updateBottomAction();
            render(); localStorage.removeItem('quiz_' + QUIZ_ID);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            showToast('Session Reset');
        }
        function shuffleAndReset() {
            if (readingMode) { showToast('Reading mode is locked until reset'); return; }
            if (mode === 'exam' && !examSubmitted && getAnsweredCount() > 0) { showToast('Shuffle locked in exam mode'); return; }
            resetQuiz(); showToast('🔀 Shuffled!');
        }

        function finishQuiz() {
            stopTimer();
            quizDirty = false;
            quizFinished = true;
            document.body.classList.add('result-mode');
            document.getElementById('ctrlBar').style.display = 'none';
            document.getElementById('bottomIsland').style.display = 'none';
            document.getElementById('examBannerWrap').style.display = 'none';

            var t = quizData.length, sk = t - correctCount - wrongCount,
                pct = t > 0 ? Math.round((correctCount / t) * 100) : 0;

            // Write all stat values
            document.getElementById('fC').textContent = correctCount;
            document.getElementById('fW').textContent = wrongCount;
            document.getElementById('fS').textContent = sk;
            document.getElementById('fM').textContent = fmtMarks(totalScore);
            document.getElementById('ringPct').textContent = pct + '%';
            document.getElementById('scTimeVal').textContent = 'Completed in ' + getElapsedTime();

            // Ring fill — circumference 2*pi*72 = 452.4
            setTimeout(function() {
                document.getElementById('ringFg').style.strokeDashoffset = 452.4 - (pct / 100) * 452.4;
            }, 500);

            var g, ti, sub, dotColor, ringGrad, glowColor;
            if (pct >= 80) {
                g = 'A'; ti = 'Excellent Work!';
                sub = 'Outstanding performance. Keep this momentum going.';
                dotColor = '#30D158'; ringGrad = 'url(#ringGradA)'; glowColor = 'rgba(52,211,153,.12)';
            } else if (pct >= 60) {
                g = 'B'; ti = 'Good Job!';
                sub = 'Solid result. A bit more practice and you will ace it.';
                dotColor = '#D4D4D8'; ringGrad = 'url(#ringGradB)'; glowColor = 'rgba(200,200,200,.07)';
            } else if (pct >= 40) {
                g = 'C'; ti = 'Keep Practicing!';
                sub = 'Making progress. Review the missed questions carefully.';
                dotColor = '#FFD60A'; ringGrad = 'url(#ringGradC)'; glowColor = 'rgba(255,214,10,.12)';
            } else {
                g = 'D'; ti = "Don't Give Up!";
                sub = 'Every expert was once a beginner. Review and retry.';
                dotColor = '#FF453A'; ringGrad = 'url(#ringGradD)'; glowColor = 'rgba(255,69,58,.12)';
            }

            // Update ring color
            document.getElementById('ringFg').setAttribute('stroke', ringGrad);

            // Update grade pill
            document.getElementById('scGradeDot').style.background = dotColor;
            document.getElementById('scGradeDot').style.boxShadow = '0 0 6px ' + dotColor;
            document.getElementById('scGradeText').textContent = 'Grade ' + g + '  ·  ' + pct + '%';

            // Update text content
            document.getElementById('scTitle').textContent = ti;
            document.getElementById('scSub').textContent = sub;

            // Scene glow (dark mode only — CSS hides in light mode)
            var g1 = document.getElementById('scGlow1');
            if (g1) g1.style.background = 'radial-gradient(circle,' + glowColor + ' 0%,transparent 70%)';
            var sg = document.getElementById('scSceneGlow');
            if (sg) sg.classList.add('show');

            // Count-up animations for stats
            function animStat(id, target, isFloat, delay) {
                setTimeout(function() {
                    var el = document.getElementById(id), dur = 700, start = null;
                    function step(ts) {
                        if (!start) start = ts;
                        var p = Math.min((ts - start) / dur, 1);
                        var e = 1 - Math.pow(1 - p, 3);
                        el.textContent = isFloat ? fmtMarks(target * e) : Math.round(target * e);
                        if (p < 1) requestAnimationFrame(step);
                        else el.textContent = isFloat ? fmtMarks(target) : target;
                    }
                    requestAnimationFrame(step);
                }, delay);
            }
            animStat('fC', correctCount, false, 600);
            animStat('fW', wrongCount,   false, 700);
            animStat('fS', sk,           false, 800);
            animStat('fM', totalScore,   true,  900);

            document.getElementById('scoreCard').classList.add('show');
            document.getElementById('qContainer').innerHTML = '';
            window.scrollTo({ top: 0, behavior: 'smooth' });

            if (pct >= 60 && typeof confetti !== 'undefined') {
                var cols = pct >= 80
                    ? ['#30D158','#34D399','#6EE7B7','#fff']
                    : ['#FFD60A','#FF9F0A','#FDE68A','#fff'];
                confetti({ particleCount: 80, spread: 65, origin: { y: .5 }, colors: cols, disableForReducedMotion: true });
                setTimeout(function() {
                    confetti({ particleCount: 40, spread: 90, origin: { y: .4 }, colors: cols, disableForReducedMotion: true });
                }, 350);
            }

            /* ══════════════════════════════════════════════════════════════════════
               TECHPSC: Notify Android app when practice-mode quiz finishes
               submitExam() already reports exam-mode completion, but practice
               mode lands directly in finishQuiz(), so report it here as well.
               ══════════════════════════════════════════════════════════════════════ */
            if (!(mode === 'exam' && examSubmitted) && typeof TechPSC !== 'undefined') {
                TechPSC.onQuizComplete(correctCount, quizData.length);
            }

            saveStorage();
        }

                function shareScore() {
            var t = quizData.length, pct = t > 0 ? Math.round((correctCount / t) * 100) : 0;
            var txt = '📖 ' + QUIZ_TITLE + '\n\n🎯 Score: ' + fmtMarks(totalScore) + '/' + t + ' (' + pct + '%)\n✅ ' + correctCount + ' | ❌ ' + wrongCount + ' | ⚡ ' + xp + ' XP | ⏱️ ' + getElapsedTime() + '\n\n' + SHARE_URL;
            if (navigator.share) navigator.share({ title: QUIZ_TITLE, text: txt, url: SHARE_URL });
            else window.open('https://wa.me/?text=  ' + encodeURIComponent(txt), '_blank');
        }

        function showToast(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('show'); }, 2200); }

        function saveStorage() {
            localStorage.setItem('quiz_' + QUIZ_ID, JSON.stringify({
                ua: userAnswers, cc: correctCount, wc: wrongCount,
                st: streak, sc: totalScore, xp: xp, time: timerSeconds, mode: mode, rm: readingMode
            }));
        }
        function loadStorage() {
            var s = localStorage.getItem('quiz_' + QUIZ_ID);
            if (s) {
                try {
                    var d = JSON.parse(s);
                    userAnswers = d.ua || {};
                    correctCount = d.cc || 0;
                    wrongCount = d.wc || 0;
                    streak = d.st || 0;
                    totalScore = d.sc || 0;
                    xp = d.xp || 0;
                    timerSeconds = d.time || 0;
                    mode = d.mode || 'practice';
                    readingMode = !!d.rm;
                    quizDirty = Object.keys(userAnswers).length > 0;
                    document.getElementById('streakNum').textContent = streak;
                    document.getElementById('xpNum').textContent = xp;
                    updateTimerDisplay();
                    updateMarks();
                    updateModeControls();
                    updateShuffleButton();
                } catch (e) { }
            }
        }

        
        document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    loadQuizPayload().then(function () {
        syncPageMeta();
        document.getElementById('topicName').textContent = getDisplayTitle();
        localStorage.removeItem('quiz_' + QUIZ_ID);
        shuffleQ();
        resetTimer();
        startTimer();
        updateModeControls();
        updateBottomAction();
        render();
    }).catch(function (error) {
        console.error('Failed to initialize master template quiz:', error);
        syncPageMeta();
        renderLoadError(error && error.message ? error.message : 'Unknown error');
    });
});