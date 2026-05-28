(function () {
    var ONBOARDED_KEY = 'nexus-onboarded';
    var MODE_KEY = 'nexus-compress-mode';

    // ── i18n helper ───────────────────────────────────────────────────
    function t(key) {
        return window.__NEXUS_T?.(key) || '';
    }

    // ═════════════════════════════════════════════════════════════════
    // FEATURE 2 — Simple / Advanced mode
    // ═════════════════════════════════════════════════════════════════
    var SIMPLE_DEFAULTS = {
        quality: 82,
        format: 'image/jpeg',
        maxWidth: 1600,
        maxHeight: null,
        targetSizeKb: null,
        scalePercent: 100,
        aspectRatio: '',
    };

    function isSimpleMode() {
        // Default to simple for first-time users (no stored preference)
        var pref = localStorage.getItem(MODE_KEY);
        return pref !== 'advanced';
    }

    function applySimpleDefaults() {
        window.__NEXUS_APPLY_COMPRESSION_VALUES?.(SIMPLE_DEFAULTS);
        window.__NEXUS_SAVE_SETTINGS?.();
    }

    var WORKFLOW_MAIN_IDS = [
        'compress-workflow-bar',
        'start-compress-btn',
        'compress-preview-stage',
        'drop-zone',
        'batch-summary',
        'download-all-btn',
        'clear-all-btn',
    ];

    function stripModeAdvancedFromWorkflow() {
        WORKFLOW_MAIN_IDS.forEach(function (id) {
            document.getElementById(id)?.removeAttribute('data-mode-advanced');
        });
    }

    function updateSidebarMode(simple) {
        var sidebar = document.getElementById('panel-compress');
        if (!sidebar) return;

        stripModeAdvancedFromWorkflow();

        // Only hide advanced settings cards in the sidebar — never main workflow UI
        var advancedCards = sidebar.querySelectorAll('.settings-card[data-mode-advanced]');
        advancedCards.forEach(function (el) {
            el.classList.toggle('is-hidden', simple);
        });

        // Show/hide simple mode message
        var simpleMsg = sidebar.querySelector('.simple-mode-msg');
        if (simpleMsg) simpleMsg.classList.toggle('is-hidden', !simple);

        // Show/hide advanced note
        var advancedNote = sidebar.querySelector('.advanced-mode-note');
        if (advancedNote) advancedNote.classList.toggle('is-hidden', simple);

        // Update toggle button states
        var btnSimple = document.getElementById('mode-btn-simple');
        var btnAdvanced = document.getElementById('mode-btn-advanced');
        if (btnSimple) btnSimple.classList.toggle('active', simple);
        if (btnAdvanced) btnAdvanced.classList.toggle('active', !simple);
    }

    function setMode(simple) {
        localStorage.setItem(MODE_KEY, simple ? 'simple' : 'advanced');
        updateSidebarMode(simple);
        if (simple) applySimpleDefaults();
        window.__NEXUS_SYNC_WORKFLOW_UI?.();
    }

    function initModeToggle() {
        var btnSimple = document.getElementById('mode-btn-simple');
        var btnAdvanced = document.getElementById('mode-btn-advanced');
        if (!btnSimple || !btnAdvanced) return;

        // Update button labels from i18n
        var labelSimple = t('modeSimple');
        var labelAdvanced = t('modeAdvanced');
        if (labelSimple) btnSimple.textContent = labelSimple;
        if (labelAdvanced) btnAdvanced.textContent = labelAdvanced;

        // Update message text from i18n
        var simpleMsg = document.querySelector('.simple-mode-msg');
        if (simpleMsg) {
            var msg = t('simpleModeMsg');
            if (msg) simpleMsg.textContent = msg;
        }
        var advancedNote = document.querySelector('.advanced-mode-note');
        if (advancedNote) {
            var note = t('simpleModeNote');
            if (note) advancedNote.textContent = note;
        }

        btnSimple.addEventListener('click', function () { setMode(true); });
        btnAdvanced.addEventListener('click', function () { setMode(false); });

        // Apply saved/default mode
        var simple = isSimpleMode();
        updateSidebarMode(simple);
        if (simple) {
            // Only apply defaults on first visit (no compression settings stored yet)
            var stored = localStorage.getItem('nexuscompress-settings');
            if (!stored) applySimpleDefaults();
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // FEATURE 1 — Goal Picker Overlay
    // ═════════════════════════════════════════════════════════════════
    function dismissPicker() {
        var overlay = document.getElementById('goal-picker');
        if (overlay) overlay.classList.add('is-hidden');
        localStorage.setItem(ONBOARDED_KEY, '1');
    }

    async function handleGoal(goal) {
        dismissPicker();
        var nav = window.__NEXUS_NAVIGATE_TOOL;
        if (!nav) return;

        switch (goal) {
            case 'whatsapp':
                await nav('compress');
                clickPreset('whatsapp');
                break;
            case 'portal':
                await nav('compress');
                clickPreset('emirates-id');
                break;
            case 'passport':
                await nav('passport-studio');
                break;
            case 'print':
                await nav('passport-studio');
                break;
            case 'redact':
                await nav('redactor');
                break;
            case 'heic':
                await nav('heic-converter');
                break;
            case 'email':
                await nav('compress');
                clickPreset('email');
                break;
            case 'website':
                await nav('compress');
                clickPreset('web');
                break;
        }
    }

    function clickPreset(key) {
        // Small delay to let navigation settle before clicking the preset button
        setTimeout(function () {
            var btn = document.querySelector('[data-preset="' + key + '"]');
            if (btn) btn.click();
        }, 150);
    }

    function applyPickerI18n() {
        var el = document.getElementById('goal-picker');
        if (!el) return;
        var keys = [
            ['goalPickerTitle', 'h2'],
            ['goalPickerSub',   'p'],
            ['goalPickerSkip',  '#goal-picker-skip'],
        ];
        keys.forEach(function (pair) {
            var text = t(pair[0]);
            if (!text) return;
            var node = pair[1].startsWith('#')
                ? el.querySelector(pair[1])
                : el.querySelector(pair[1]);
            if (node) node.textContent = text;
        });
        var cardKeys = {
            'goalWhatsapp':  '[data-goal="whatsapp"] .goal-card__title',
            'goalWhatsappHint': '[data-goal="whatsapp"] .goal-card__hint',
            'goalPortal':    '[data-goal="portal"] .goal-card__title',
            'goalPortalHint':   '[data-goal="portal"] .goal-card__hint',
            'goalPassport':  '[data-goal="passport"] .goal-card__title',
            'goalPassportHint': '[data-goal="passport"] .goal-card__hint',
            'goalPrint':     '[data-goal="print"] .goal-card__title',
            'goalPrintHint':    '[data-goal="print"] .goal-card__hint',
            'goalRedact':    '[data-goal="redact"] .goal-card__title',
            'goalRedactHint':   '[data-goal="redact"] .goal-card__hint',
            'goalHeic':      '[data-goal="heic"] .goal-card__title',
            'goalHeicHint':     '[data-goal="heic"] .goal-card__hint',
            'goalEmail':     '[data-goal="email"] .goal-card__title',
            'goalEmailHint':    '[data-goal="email"] .goal-card__hint',
            'goalWebsite':   '[data-goal="website"] .goal-card__title',
            'goalWebsiteHint':  '[data-goal="website"] .goal-card__hint',
        };
        Object.keys(cardKeys).forEach(function (key) {
            var text = t(key);
            if (!text) return;
            var node = el.querySelector(cardKeys[key]);
            if (node) node.textContent = text;
        });
    }

    function initGoalPicker() {
        if (localStorage.getItem(ONBOARDED_KEY)) return;

        var overlay = document.getElementById('goal-picker');
        if (!overlay) return;

        applyPickerI18n();
        overlay.classList.remove('is-hidden');

        // Goal card clicks
        overlay.querySelectorAll('.goal-card').forEach(function (btn) {
            btn.addEventListener('click', function () {
                handleGoal(btn.dataset.goal);
            });
        });

        // Skip link
        var skip = document.getElementById('goal-picker-skip');
        if (skip) {
            skip.addEventListener('click', function (e) {
                e.preventDefault();
                dismissPicker();
            });
        }

        // Backdrop click to skip
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) dismissPicker();
        });

        // Escape key
        document.addEventListener('keydown', function onEsc(e) {
            if (e.key === 'Escape') {
                dismissPicker();
                document.removeEventListener('keydown', onEsc);
            }
        });
    }

    // ── Bootstrap ────────────────────────────────────────────────────
    function init() {
        initModeToggle();
        initGoalPicker();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
