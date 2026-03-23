"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';

type UseAIComponentOptions = {
  html: string;
  fallbackImageSrc?: string;
};

type UseAIComponentResult = {
  containerRef: RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  hasError: boolean;
  errorMessage: string | null;
};

const DEFAULT_FALLBACK_IMAGE = '/images/ai-placeholder.svg';

function isExternalScriptTag(script: HTMLScriptElement) {
  return Boolean(script.src && script.src.trim());
}

function applyImageEnhancements(
  root: HTMLElement,
  fallbackImageSrc: string,
  onAnyImageSettled: () => void
) {
  const images = Array.from(root.querySelectorAll('img'));
  if (images.length === 0) {
    onAnyImageSettled();
    return;
  }

  let settledCount = 0;
  const total = images.length;

  const markSettled = () => {
    settledCount += 1;
    if (settledCount >= total) onAnyImageSettled();
  };

  images.forEach((img) => {
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.style.display = img.style.display || 'block';
    img.style.maxWidth = img.style.maxWidth || '100%';
    img.style.width = img.style.width || '100%';
    img.style.height = img.style.height || 'auto';
    img.style.objectFit = img.style.objectFit || 'cover';
    img.style.aspectRatio = img.style.aspectRatio || '16 / 9';
    img.style.backgroundColor = img.style.backgroundColor || 'rgba(0,0,0,0.04)';

    const originalOnError = img.onerror;
    const originalOnLoad = img.onload;

    img.onerror = (event) => {
      const alreadyFallback =
        img.src === `${window.location.origin}${fallbackImageSrc}` ||
        img.src.endsWith(fallbackImageSrc);

      if (!alreadyFallback) {
        img.src = fallbackImageSrc;
      }

      img.dataset.aiImageState = 'error';
      img.style.opacity = '1';
      markSettled();
      if (typeof originalOnError === 'function') originalOnError.call(img, event);
    };

    img.onload = (event) => {
      img.dataset.aiImageState = 'loaded';
      img.style.opacity = '1';
      img.style.transition = 'opacity 220ms ease';
      markSettled();
      if (typeof originalOnLoad === 'function') originalOnLoad.call(img, event);
    };

    if (img.complete) {
      if (img.naturalWidth > 0) {
        img.dataset.aiImageState = 'loaded';
        img.style.opacity = '1';
      } else {
        img.src = fallbackImageSrc;
        img.dataset.aiImageState = 'error';
        img.style.opacity = '1';
      }
      markSettled();
    } else {
      img.dataset.aiImageState = 'loading';
      img.style.opacity = '0';
      img.style.transition = 'opacity 220ms ease';
    }
  });
}

function runInlineScripts(root: HTMLElement) {
  const scripts = Array.from(root.querySelectorAll('script'));

  for (const oldScript of scripts) {
    if (isExternalScriptTag(oldScript)) {
      continue;
    }

    const newScript = document.createElement('script');
    const scriptType = oldScript.type || 'text/javascript';
    newScript.type = scriptType;

    const originalContent = oldScript.textContent || '';
    if (scriptType === 'module') {
      // Keep module semantics unchanged.
      newScript.text = originalContent;
    } else {
      // Isolate declarations to avoid duplicate global identifier errors on re-render.
      newScript.text = `(function(){\n${originalContent}\n})();`;
    }

    for (const attr of Array.from(oldScript.attributes)) {
      if (attr.name !== 'src') {
        newScript.setAttribute(attr.name, attr.value);
      }
    }

    try {
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    } catch (error) {
      // Keep rendering the component even if one inline script fails to parse/execute.
      console.warn('AI component inline script failed:', error);
      oldScript.remove();
    }
  }
}

function normalizeArgs(input: string | undefined | UseAIComponentOptions): UseAIComponentOptions {
  if (typeof input === 'string' || input === undefined) {
    return {
      html: String(input ?? ''),
      fallbackImageSrc: DEFAULT_FALLBACK_IMAGE,
    };
  }

  return {
    html: input.html,
    fallbackImageSrc: input.fallbackImageSrc ?? DEFAULT_FALLBACK_IMAGE,
  };
}

export function useAIComponent(input: string | undefined | UseAIComponentOptions): UseAIComponentResult {
  const { html, fallbackImageSrc } = normalizeArgs(input);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const normalizedHtml = useMemo(() => (typeof html === 'string' ? html.trim() : ''), [html]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setIsLoading(true);
    setHasError(false);
    setErrorMessage(null);

    if (!normalizedHtml) {
      container.innerHTML = '';
      setHasError(true);
      setErrorMessage('No component HTML was provided.');
      setIsLoading(false);
      return;
    }

    try {
      container.innerHTML = normalizedHtml;

      applyImageEnhancements(container, fallbackImageSrc ?? '', () => {
        setIsLoading(false);
      });

      runInlineScripts(container);
    } catch (error) {
      container.innerHTML = '';
      setHasError(true);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to render AI component.');
      setIsLoading(false);
    }

    return () => {
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [normalizedHtml, fallbackImageSrc]);

  return {
    containerRef,
    isLoading,
    hasError,
    errorMessage,
  };
}
