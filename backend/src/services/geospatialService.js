'use strict';

/**
 * Geospatial Service — v1 simulated lookups
 *
 * Provides water-stress classification (WRI Aqueduct style) and protected-area
 * proximity checks (WDPA/KBA style) using simplified heuristic rules and a
 * small demo dataset.  In production these would call the actual WRI Aqueduct
 * API and the WDPA / KBA APIs.
 */

// ─── Water-Stress Regions (simplified WRI Aqueduct heuristic) ───────────────
// Each region is a bounding box [latMin, latMax, lngMin, lngMax] + stress level.
const WATER_STRESS_REGIONS = [
  // Middle East
  { latMin: 12, latMax: 42, lngMin: 25, lngMax: 60, stress: 'Extremely High' },
  // North Africa (Sahara belt)
  { latMin: 15, latMax: 37, lngMin: -17, lngMax: 25, stress: 'High' },
  // Northwest India / Pakistan
  { latMin: 20, latMax: 35, lngMin: 60, lngMax: 80, stress: 'High' },
  // Southern India
  { latMin: 8, latMax: 20, lngMin: 73, lngMax: 85, stress: 'Medium-High' },
  // Southwest US (Arizona, Nevada, SoCal)
  { latMin: 31, latMax: 37, lngMin: -120, lngMax: -109, stress: 'Extremely High' },
  // Central California
  { latMin: 34, latMax: 40, lngMin: -122, lngMax: -118, stress: 'High' },
  // Northern China (North China Plain)
  { latMin: 32, latMax: 42, lngMin: 110, lngMax: 122, stress: 'High' },
  // Central Australia
  { latMin: -30, latMax: -20, lngMin: 125, lngMax: 145, stress: 'Extremely High' },
  // Southeast Australia (Murray-Darling)
  { latMin: -38, latMax: -30, lngMin: 140, lngMax: 155, stress: 'High' },
  // Southern Spain
  { latMin: 36, latMax: 40, lngMin: -6, lngMax: 3, stress: 'Medium-High' },
  // Northern Europe (Scandinavia, UK, Benelux)
  { latMin: 50, latMax: 72, lngMin: -12, lngMax: 30, stress: 'Low' },
  // Canada
  { latMin: 48, latMax: 72, lngMin: -140, lngMax: -52, stress: 'Low' },
  // Amazon basin
  { latMin: -15, latMax: 5, lngMin: -75, lngMax: -45, stress: 'Low' },
  // Central Africa (Congo basin)
  { latMin: -10, latMax: 10, lngMin: 10, lngMax: 35, stress: 'Low' },
  // Southeast Asia (tropical)
  { latMin: -10, latMax: 25, lngMin: 95, lngMax: 130, stress: 'Low-Medium' },
  // Sub-Saharan East Africa
  { latMin: -15, latMax: 12, lngMin: 25, lngMax: 50, stress: 'Medium-High' },
  // Southern Africa
  { latMin: -35, latMax: -22, lngMin: 16, lngMax: 33, stress: 'Medium-High' },
  // Mediterranean (Italy, Greece)
  { latMin: 36, latMax: 46, lngMin: 5, lngMax: 30, stress: 'Medium-High' },
  // Central US (Great Plains)
  { latMin: 30, latMax: 48, lngMin: -105, lngMax: -90, stress: 'Low-Medium' },
  // Eastern US
  { latMin: 25, latMax: 48, lngMin: -90, lngMax: -65, stress: 'Low' },
];

// ─── Protected Areas demo dataset (~20 famous ones) ────────────────────────
const PROTECTED_AREAS = [
  { name: 'Yellowstone National Park', designation: 'National Park', lat: 44.43, lng: -110.59 },
  { name: 'Great Barrier Reef Marine Park', designation: 'Marine Park', lat: -18.29, lng: 147.70 },
  { name: 'Serengeti National Park', designation: 'National Park', lat: -2.33, lng: 34.83 },
  { name: 'Galápagos Marine Reserve', designation: 'Marine Reserve', lat: -0.83, lng: -91.10 },
  { name: 'Amazon Rainforest Reserve', designation: 'Forest Reserve', lat: -3.47, lng: -62.22 },
  { name: 'Kruger National Park', designation: 'National Park', lat: -23.99, lng: 31.55 },
  { name: 'Banff National Park', designation: 'National Park', lat: 51.50, lng: -116.50 },
  { name: 'Torres del Paine National Park', designation: 'National Park', lat: -51.00, lng: -73.00 },
  { name: 'Sundarbans Mangrove Forest', designation: 'UNESCO World Heritage', lat: 21.95, lng: 89.18 },
  { name: 'Black Forest Nature Park', designation: 'Nature Park', lat: 48.30, lng: 8.20 },
  { name: 'Doñana National Park', designation: 'National Park', lat: 36.98, lng: -6.44 },
  { name: 'Lake District National Park', designation: 'National Park', lat: 54.47, lng: -3.08 },
  { name: 'Bavarian Forest National Park', designation: 'National Park', lat: 48.92, lng: 13.40 },
  { name: 'Wadden Sea', designation: 'UNESCO World Heritage', lat: 53.60, lng: 8.30 },
  { name: 'Fiordland National Park', designation: 'National Park', lat: -45.42, lng: 167.72 },
  { name: 'Kakadu National Park', designation: 'National Park', lat: -12.83, lng: 132.50 },
  { name: 'Swiss National Park', designation: 'National Park', lat: 46.66, lng: 10.18 },
  { name: 'Plitvice Lakes National Park', designation: 'National Park', lat: 44.88, lng: 15.62 },
  { name: 'Zhangjiajie National Forest Park', designation: 'Forest Park', lat: 29.32, lng: 110.43 },
  { name: 'Masai Mara National Reserve', designation: 'National Reserve', lat: -1.50, lng: 35.00 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Haversine distance in km between two lat/lng points.
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Simulated WRI Aqueduct water-stress lookup.
 * Returns one of: 'Low' | 'Low-Medium' | 'Medium-High' | 'High' | 'Extremely High'
 */
function lookupWaterStress(lat, lng) {
  if (lat == null || lng == null) return null;

  // Walk through regions — first match wins (more-specific regions listed first)
  for (const r of WATER_STRESS_REGIONS) {
    if (lat >= r.latMin && lat <= r.latMax && lng >= r.lngMin && lng <= r.lngMax) {
      return r.stress;
    }
  }
  // Default for unmatched locations
  return 'Low-Medium';
}

/**
 * Simulated WDPA/KBA protected-area lookup.
 * Returns { inProtectedArea: bool, nearbyAreas: [{ name, designation, distanceKm }] }
 */
function lookupProtectedAreas(lat, lng, radiusKm = 50) {
  if (lat == null || lng == null) {
    return { inProtectedArea: false, nearbyAreas: [] };
  }

  const nearby = [];
  for (const pa of PROTECTED_AREAS) {
    const dist = haversineKm(lat, lng, pa.lat, pa.lng);
    if (dist <= radiusKm) {
      nearby.push({
        name: pa.name,
        designation: pa.designation,
        distanceKm: Math.round(dist * 10) / 10,
      });
    }
  }

  nearby.sort((a, b) => a.distanceKm - b.distanceKm);

  return {
    inProtectedArea: nearby.some((a) => a.distanceKm < 5),
    nearbyAreas: nearby,
  };
}

/**
 * Stub geocoder — would call a real geocoding API in production.
 * Returns null for now.
 */
function geocodeAddress(_address) {
  return null;
}

module.exports = {
  lookupWaterStress,
  lookupProtectedAreas,
  geocodeAddress,
  haversineKm,
};
