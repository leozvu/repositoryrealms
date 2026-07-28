'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  APP_LOCALE_COOKIE,
  APP_LOCALE_STORAGE_KEY,
  normalizeAppLocale,
  translateUiCopy,
} from '@/lib/i18n';

const LanguageContext = createContext({
  locale: 'vi',
  setLocale: () => {},
  t: (value) => value,
});

const ORIGINAL_TEXT = new WeakMap();
const ORIGINAL_ATTRIBUTES = new WeakMap();
const TRANSLATABLE_ATTRIBUTES = ['aria-label', 'placeholder', 'title'];

function ignoredNode(node) {
  const parent = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  return !parent || parent.closest('script, style, code, pre, [contenteditable="true"], [data-no-i18n]');
}

function localizeTextNode(node, locale) {
  if (ignoredNode(node)) return;
  const current = node.nodeValue || '';
  const stored = ORIGINAL_TEXT.get(node);
  const storedEnglish = stored === undefined ? null : translateUiCopy(stored, 'en');
  // React can replace a text node after hydration (loading → ready, pending →
  // approved, presence counts, and so on). Treat any value that is neither the
  // stored source nor our English projection as new source copy. Otherwise the
  // observer would incorrectly restore the first render forever in VI mode.
  if (stored === undefined || (current !== stored && current !== storedEnglish)) {
    ORIGINAL_TEXT.set(node, current);
  }
  const original = ORIGINAL_TEXT.get(node) || '';
  const next = locale === 'en' ? translateUiCopy(original, 'en') : original;
  if (current !== next) node.nodeValue = next;
}

function localizeAttributes(element, locale) {
  if (ignoredNode(element)) return;
  let originals = ORIGINAL_ATTRIBUTES.get(element);
  if (!originals) {
    originals = {};
    ORIGINAL_ATTRIBUTES.set(element, originals);
  }
  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    if (!element.hasAttribute(attribute)) continue;
    const current = element.getAttribute(attribute) || '';
    const stored = originals[attribute];
    const storedEnglish = stored === undefined ? null : translateUiCopy(stored, 'en');
    if (stored === undefined || (current !== stored && current !== storedEnglish)) originals[attribute] = current;
    const original = originals[attribute] || '';
    const next = locale === 'en' ? translateUiCopy(original, 'en') : original;
    if (current !== next) element.setAttribute(attribute, next);
  }
}

function localizeTree(root, locale) {
  if (!root || ignoredNode(root)) return;
  if (root.nodeType === Node.TEXT_NODE) {
    localizeTextNode(root, locale);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) localizeAttributes(root, locale);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) localizeTextNode(node, locale);
    else localizeAttributes(node, locale);
    node = walker.nextNode();
  }
}

function AutoLocalizer({ locale }) {
  const localeRef = useRef(locale);
  useEffect(() => { localeRef.current = locale; }, [locale]);

  useEffect(() => {
    localizeTree(document.body, locale);
    let frame = 0;
    const pending = new Set();
    const flush = () => {
      frame = 0;
      for (const node of pending) localizeTree(node, localeRef.current);
      pending.clear();
    };
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') pending.add(mutation.target);
        else if (mutation.type === 'attributes') pending.add(mutation.target);
        else for (const node of mutation.addedNodes) pending.add(node);
      }
      if (!frame && pending.size) frame = window.requestAnimationFrame(flush);
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES,
    });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [locale]);
  return null;
}

export function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState('vi');

  useEffect(() => {
    const cookieLocale = document.cookie.match(/(?:^|;\s*)crmegoric_locale=([^;]+)/)?.[1];
    const storedLocale = window.localStorage.getItem(APP_LOCALE_STORAGE_KEY);
    setLocaleState(normalizeAppLocale(storedLocale || cookieLocale));
  }, []);

  const setLocale = useCallback((value) => {
    const next = normalizeAppLocale(value);
    setLocaleState(next);
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, next);
    document.cookie = `${APP_LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  const value = useMemo(() => ({
    locale,
    setLocale,
    t: (copy) => translateUiCopy(copy, locale),
  }), [locale, setLocale]);

  return (
    <LanguageContext.Provider value={value}>
      <AutoLocalizer locale={locale} />
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageSwitch({ compact = false, className = '' }) {
  const { locale, setLocale } = useLanguage();
  return (
    <div className={`language-switch ${compact ? 'language-switch-compact' : ''} ${className}`.trim()} role="group" aria-label="Language / Ngôn ngữ" data-no-i18n>
      <button type="button" aria-pressed={locale === 'vi'} onClick={() => setLocale('vi')} lang="vi">VI</button>
      <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocale('en')} lang="en">EN</button>
    </div>
  );
}
