export interface FlowHeader {
  id: string;
  name: string;
  value: string;
}

export interface FlowVariableSet {
  id: string;
  key: string;
  expression: string;
}

export interface OpenApiSecurityScheme {
  name: string;
  type: string;
  scheme?: string;
  bearerFormat?: string;
}

export interface OpenApiOperation {
  id: string;
  method: string;
  path: string;
  title: string;
  description?: string;
  defaultUrl: string;
  defaultBody: string;
  defaultHeaders: FlowHeader[];
  securitySchemeNames: string[];
}

export interface OpenApiImportResult {
  title: string;
  description?: string;
  servers: string[];
  operations: OpenApiOperation[];
  securitySchemes: OpenApiSecurityScheme[];
}

export interface RequestFlowStep {
  id: string;
  kind: 'request';
  stepName: string;
  method: string;
  url: string;
  headers: FlowHeader[];
  body: string;
  sourceOperationId?: string;
  sourceSpecId?: string;
  baseUrlVar?: string;
  authMode: 'none' | 'client' | 'ops';
  variableSets: FlowVariableSet[];
}

export interface WaitFlowStep {
  id: string;
  kind: 'wait';
  stepName: string;
  seconds: string;
}

export interface PauseFlowStep {
  id: string;
  kind: 'pause';
  stepName: string;
  label: string;
}

export type FlowStep = RequestFlowStep | WaitFlowStep | PauseFlowStep;
