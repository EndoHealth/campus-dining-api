import { TOP_50_SCHOOLS } from './top50-schools.js';
import type {
  CoverageSummary,
  IntegrationStatus,
  ProviderKind,
  SupportStatus,
} from '../types/dining.js';

const SUPPORT_STATUSES: SupportStatus[] = ['confirmed', 'needs_poc', 'unsupported'];
const INTEGRATION_STATUSES: IntegrationStatus[] = [
  'cataloged',
  'adapter_pending',
  'adapter_ready',
  'poc_required',
];

const PROVIDER_KINDS: ProviderKind[] = [
  'official_api',
  'official_html',
  'vendor_bonappetit',
  'vendor_campusdish',
  'vendor_dineoncampus',
  'vendor_foodpro',
  'vendor_mydininghub',
  'vendor_netnutrition',
  'vendor_nutrislice',
  'vendor_sodexo',
  'student_api',
];

export function buildCoverageSummary(generatedAt = new Date().toISOString()): CoverageSummary {
  const statusCounts = Object.fromEntries(
    SUPPORT_STATUSES.map((status) => [status, 0])
  ) as Record<SupportStatus, number>;

  const providerCounts = Object.fromEntries(
    PROVIDER_KINDS.map((provider) => [provider, 0])
  ) as Record<ProviderKind, number>;

  const integrationCounts = Object.fromEntries(
    INTEGRATION_STATUSES.map((status) => [status, 0])
  ) as Record<IntegrationStatus, number>;

  for (const school of TOP_50_SCHOOLS) {
    statusCounts[school.supportStatus] += 1;
    integrationCounts[school.integrationStatus] += 1;
    providerCounts[school.providerKind] += 1;
  }

  return {
    totalSchools: TOP_50_SCHOOLS.length,
    statusCounts,
    integrationCounts,
    providerCounts,
    confirmedSchools: statusCounts.confirmed,
    needsPocSchools: statusCounts.needs_poc,
    adapterReadySchools: integrationCounts.adapter_ready,
    generatedAt,
  };
}

export function findSchoolById(id: string) {
  return TOP_50_SCHOOLS.find((school) => school.id === id);
}
