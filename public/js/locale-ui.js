(function () {
    'use strict';

    var locale = window.__NEXUS_LOCALE || 'en';
    var strings = window.__NEXUS_I18N?.[locale] || window.__NEXUS_I18N?.en || {};
    var siteUrl = 'https://compress.funadventure.ae';

    function t(key) {
        return strings[key] ?? window.__NEXUS_I18N?.en?.[key] ?? '';
    }

    function tFmt(key, vars) {
        var s = t(key);
        if (!vars || !s) return s;
        Object.keys(vars).forEach(function (k) {
            s = s.split('{' + k + '}').join(String(vars[k]));
        });
        return s;
    }

    function applyI18n() {
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.dataset.i18n;
            var val = t(key);
            if (!val) return;
            if (el.dataset.i18nAttr) {
                el.setAttribute(el.dataset.i18nAttr, val);
            } else {
                el.textContent = val;
            }
        });

        document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
            var key = el.dataset.i18nHtml;
            var val = t(key);
            if (val) el.innerHTML = val;
        });
    }

    function localePath(targetLocale) {
        var hash = location.hash || '';
        if (targetLocale === 'ar') return '/ar/' + hash;
        return '/' + hash;
    }

    function bindLangSwitch() {
        document.querySelectorAll('[data-locale-link]').forEach(function (link) {
            var target = link.dataset.localeLink;
            link.href = localePath(target);
            link.classList.toggle('is-active', target === locale);
            if (target === locale) link.setAttribute('aria-current', 'true');
            else link.removeAttribute('aria-current');
        });
    }

    function patchMeta() {
        if (locale !== 'ar') return;
        var ogLocale = document.querySelector('meta[property="og:locale"]');
        if (ogLocale) ogLocale.setAttribute('content', 'ar_AE');
    }

    function bindLocaleLinks() {
        document.querySelectorAll('[data-locale-href-en]').forEach(function (link) {
            var en = link.dataset.localeHrefEn;
            var ar = link.dataset.localeHrefAr;
            if (locale === 'ar' && ar) link.href = ar;
            else if (en) link.href = en;
        });
    }

    window.__NEXUS_T = t;
    window.__NEXUS_TF = tFmt;
    window.__NEXUS_APPLY_I18N = applyI18n;

    applyI18n();
    bindLangSwitch();
    bindLocaleLinks();
    patchMeta();

    document.addEventListener('DOMContentLoaded', function () {
        applyI18n();
        bindLangSwitch();
        bindLocaleLinks();
    });
})();
