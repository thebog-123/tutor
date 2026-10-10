import { useEffect, useState } from 'react';

// Hash routes (#/g/<id>/games) work on any static host, including GitHub Pages,
// with no server rewrite rules.

function current(): string[] {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return raw.split('/').filter(Boolean).map(decodeURIComponent);
}

export function useRoute(): string[] {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const onChange = () => {
      setRoute(current());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string, replace = false) {
  const hash = `#${path.startsWith('/') ? path : `/${path}`}`;
  if (replace) window.location.replace(hash);
  else window.location.hash = hash;
}

export function appUrl(path: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${path}`;
}
