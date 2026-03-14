/**
 * OpenAPI spec config: maps each spec to its base URL variable (from .env) and auth type.
 */

export interface SpecConfig {
  id: string;
  label: string;
  file: string;
  baseUrlVar: string;
  authMode: 'client' | 'ops';
}

export const SPEC_CONFIG: SpecConfig[] = [
  {
    id: 'public',
    label: 'Public API',
    file: '/specs/base.yml',
    baseUrlVar: 'public_url',
    authMode: 'client',
  },
  {
    id: 'ops',
    label: 'Ops API',
    file: '/specs/bondsmith-savings-exchange-operation-portal-apis-0.1.yml',
    baseUrlVar: 'ops_url',
    authMode: 'ops',
  },
  {
    id: 'simulator',
    label: 'Simulator API',
    file: '/specs/savings-simulator-api-v1.yml',
    baseUrlVar: 'simulator_url',
    authMode: 'ops',
  },
];
