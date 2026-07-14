const geocodeCache = new Map<string, string>();

const LOCATION_IQ_KEY =
  process.env.LOCATIONIQ_KEY ||
  process.env.NEXT_PUBLIC_LOCATIONIQ_KEY ||
  'pk.3b2184e753ac3f66005ebd3b8ab0f9f7';

const LOCATION_IQ_BASE = 'https://us1.locationiq.com/v1';

let lastRequestAt = 0;
const MIN_GAP_MS = 650;

async function rateLimit() {
  const now = Date.now();
  const wait = MIN_GAP_MS - (now - lastRequestAt);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();
}

function formatAddress(address: Record<string, unknown>) {
  const road = String(address.road || address.pedestrian || address.highway || '').trim();
  const area = String(
    address.suburb || address.neighbourhood || address.residential || address.village || address.town || ''
  ).trim();
  const city = String(address.city || address.city_district || address.county || address.state || '').trim();

  const parts: string[] = [];
  if (road) parts.push(road);
  if (area && (!road || parts.length < 2)) parts.push(area);
  if (city && city !== area) parts.push(city);

  return parts.length > 0 ? parts.join(', ') : '';
}

function extractAddress(data: any): string | null {
  if (typeof data?.display_name === 'string' && data.display_name.trim()) {
    return data.display_name.trim();
  }
  if (data?.address && typeof data.address === 'object') {
    const formatted = formatAddress(data.address as Record<string, unknown>);
    if (formatted) return formatted;
  }
  return null;
}

async function fetchNominatim(lat: number, lon: number): Promise<string | null> {
  await rateLimit();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=ur`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'AlmTrackBillingHub/1.0 (chatbot-reports; contact: almtrace.com)',
        },
        signal: controller.signal,
      }
    );
    if (!response.ok) return null;
    return extractAddress(await response.json());
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchLocationIq(lat: number, lon: number): Promise<string | null> {
  if (!LOCATION_IQ_KEY) return null;
  await rateLimit();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(
      `${LOCATION_IQ_BASE}/reverse?key=${LOCATION_IQ_KEY}&lat=${lat}&lon=${lon}&format=json&accept-language=ur`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }
    );
    if (!response.ok) return null;
    return extractAddress(await response.json());
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Reverse geocode coordinates — Nominatim first, then LocationIQ (same as Android app).
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return 'Location unavailable';
  }

  const cacheKey = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached) return cached;

  try {
    const fromNominatim = await fetchNominatim(lat, lon);
    if (fromNominatim) {
      geocodeCache.set(cacheKey, fromNominatim);
      return fromNominatim;
    }
  } catch (error) {
    console.warn('Nominatim reverse geocode failed:', error);
  }

  try {
    const fromLocationIq = await fetchLocationIq(lat, lon);
    if (fromLocationIq) {
      geocodeCache.set(cacheKey, fromLocationIq);
      return fromLocationIq;
    }
  } catch (error) {
    console.warn('LocationIQ reverse geocode failed:', error);
  }

  const fallback = 'Location unavailable';
  geocodeCache.set(cacheKey, fallback);
  return fallback;
}
