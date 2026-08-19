import { Injectable, Logger } from '@nestjs/common';

export interface GeoLocationInfo {
  source: 'ip' | 'client' | 'local' | 'unknown';
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  lat?: number;
  lng?: number;
  query?: string;
}

const LOCAL_IPS = ['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'];

function isPrivateIp(ip: string): boolean {
  const cleaned = (ip || '').replace(/^::ffff:/, '');
  if (LOCAL_IPS.includes(cleaned)) return true;
  if (/^10\./.test(cleaned)) return true;
  if (/^192\.168\./.test(cleaned)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(cleaned)) return true;
  if (/^127\./.test(cleaned)) return true;
  return false;
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface CacheEntry {
  data: GeoLocationInfo;
  at: number;
}

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000;
  private readonly REQUEST_TIMEOUT_MS = 2500;

  /** Resolve location by IP via the public ip-api.com lookup (no key needed). */
  async lookupIp(ip?: string): Promise<GeoLocationInfo> {
    const cleaned = (ip || '').replace(/^::ffff:/, '');
    if (!cleaned || cleaned === 'unknown' || isPrivateIp(cleaned)) {
      return {
        source: 'local',
        country: 'Localhost',
        countryCode: 'LO',
        city: 'Local',
      };
    }

    const cached = this.cache.get(cleaned);
    if (cached && Date.now() - cached.at < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        this.REQUEST_TIMEOUT_MS,
      );
      const res = await fetch(
        `http://ip-api.com/json/${encodeURIComponent(cleaned)}?fields=status,country,countryCode,regionName,city,lat,lon,query`,
        { signal: controller.signal },
      );
      clearTimeout(timer);
      const data = (await res.json()) as {
        status?: string;
        country?: string;
        countryCode?: string;
        regionName?: string;
        city?: string;
        lat?: number;
        lon?: number;
        query?: string;
      };
      if (data?.status !== 'success') {
        return { source: 'unknown', query: cleaned };
      }
      const info: GeoLocationInfo = {
        source: 'ip',
        country: data.country,
        countryCode: data.countryCode,
        region: data.regionName,
        city: data.city,
        lat: data.lat,
        lng: data.lon,
        query: data.query || cleaned,
      };
      this.cache.set(cleaned, { data: info, at: Date.now() });
      return info;
    } catch (error) {
      this.logger.debug(
        `IP geolocation lookup failed for ${cleaned}: ${(error as Error).message}`,
      );
      return { source: 'unknown', query: cleaned };
    }
  }

  /**
   * Compares a client-supplied coordinate pair (browser geolocation) with the
   * IP-resolved coordinates. Returns null when either side is unavailable.
   */
  compareCoordinates(
    clientLat?: number,
    clientLng?: number,
    ipLat?: number,
    ipLng?: number,
  ): { distanceKm: number; mismatch: boolean } | null {
    if (
      clientLat == null ||
      clientLng == null ||
      ipLat == null ||
      ipLng == null ||
      isNaN(clientLat) ||
      isNaN(clientLng)
    ) {
      return null;
    }
    const distanceKm = haversineKm(clientLat, clientLng, ipLat, ipLng);
    return { distanceKm: Math.round(distanceKm), mismatch: distanceKm > 300 };
  }

  coordsOf(lat?: unknown, lng?: unknown): { lat?: number; lng?: number } {
    const l = Number(lat);
    const n = Number(lng);
    if (isNaN(l) || isNaN(n)) return {};
    return { lat: l, lng: n };
  }
}
