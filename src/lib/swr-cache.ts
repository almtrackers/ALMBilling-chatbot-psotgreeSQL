
'use client';

import type { Cache } from 'swr';

function localStorageProvider(): Cache<any> {
  if (typeof window === 'undefined') {
    // Return a dummy cache on the server, as localStorage is not available.
    return new Map();
  }

  // When initializing on the client, restore the data from `localStorage` into a map.
  const map = new Map<string, any>(JSON.parse(localStorage.getItem('app-cache') || '[]'));

  // Before unloading the app, write back all the data into `localStorage`.
  window.addEventListener('beforeunload', () => {
    const appCache = JSON.stringify(Array.from(map.entries()));
    localStorage.setItem('app-cache', appCache);
  });

  // We use the map for write & read for performance on the client.
  return map;
}

export { localStorageProvider };
