import { useEffect, useState } from 'react';

/** Hash routing: works on GitHub Pages without server rewrites, and survives refresh. */
export function useRoute(): string[] {
  const read = () => parseRoute(location.hash);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/** Parse "#/a/b" safely: malformed percent-encoding never throws. */
export function parseRoute(hash: string): string[] {
  return (hash.replace(/^#\/?/, '') || 'home').split('/').map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
}

export function go(path: string) {
  location.hash = `#/${path}`;
}

export function back(fallback = 'home') {
  if (history.length > 1) history.back();
  else go(fallback);
}
