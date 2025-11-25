export const REGIONS = {
  WORLDWIDE: {
    id: 'worldwide',
    name: 'Worldwide',
    slug: 'worldwide'
  },
  JAPAN: {
    id: 'japan',
    name: 'Japan',
    slug: 'japan'
  },
  ASIA_PACIFIC: {
    id: 'asia-pacific',
    name: 'Asia Pacific',
    slug: 'asia-pacific'
  },
  AMERICAS: {
    id: 'americas',
    name: 'Americas',
    slug: 'americas'
  },
  EMEA: {
    id: 'europe-middle-east-africa',
    name: 'Europe, Middle East, and Africa',
    slug: 'europe-middle-east-africa'
  },
  MIZUHO_BANK: {
    id: 'mizuho-bank',
    name: 'Mizuho Bank',
    slug: 'mizuho-bank'
  },
  MIZUHO_TRUST: {
    id: 'mizuho-trust-banking',
    name: 'Mizuho Trust & Banking',
    slug: 'mizuho-trust-banking'
  },
  MIZUHO_SECURITIES: {
    id: 'mizuho-securities',
    name: 'Mizuho Securities',
    slug: 'mizuho-securities'
  },
  MIZUHO_RESEARCH: {
    id: 'mizuho-research-technologies',
    name: 'Mizuho Research & Technologies',
    slug: 'mizuho-research-technologies'
  }
};

export const REGION_MAPPING = {
  'worldwide': REGIONS.WORLDWIDE,
  'japan': REGIONS.JAPAN,
  'asia-pacific': REGIONS.ASIA_PACIFIC,
  'americas': REGIONS.AMERICAS,
  'europe-middle-east-africa': REGIONS.EMEA,
  'emea': REGIONS.EMEA,
  'mizuho-bank': REGIONS.MIZUHO_BANK,
  'mizuho-trust-banking': REGIONS.MIZUHO_TRUST,
  'mizuho-trust': REGIONS.MIZUHO_TRUST,
  'mizuho-securities': REGIONS.MIZUHO_SECURITIES,
  'mizuho-research-technologies': REGIONS.MIZUHO_RESEARCH,
  'mizuho-research': REGIONS.MIZUHO_RESEARCH
};

export const VALID_REGIONS = Object.keys(REGION_MAPPING);

export function getRegionById(id) {
  return REGION_MAPPING[id?.toLowerCase()] || REGIONS.WORLDWIDE;
}

export function getAllRegions() {
  return Object.values(REGIONS);
}

export function isValidRegion(region) {
  return VALID_REGIONS.includes(region?.toLowerCase());
}

export default {
  REGIONS,
  REGION_MAPPING,
  VALID_REGIONS,
  getRegionById,
  getAllRegions,
  isValidRegion
};