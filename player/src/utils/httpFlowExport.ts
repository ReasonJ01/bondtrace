import type { FlowHeader, FlowStep, RequestFlowStep } from '../types/flow-builder';

function headerLines(headers: FlowHeader[]): string[] {
  return headers
    .filter((header) => header.name.trim())
    .map((header) => `${header.name.trim()}: ${header.value}`);
}

function requestAuthLine(step: RequestFlowStep): string | null {
  if (step.authMode === 'client') return '@auth client_token';
  if (step.authMode === 'ops') return '@auth ops_token';
  return null;
}

function exportRequestStep(step: RequestFlowStep): string {
  const lines: string[] = [];
  if (step.stepName.trim()) {
    lines.push(`@name ${step.stepName.trim()}`);
  }

  const authLine = requestAuthLine(step);
  if (authLine) lines.push(authLine);

  for (const variableSet of step.variableSets) {
    if (!variableSet.key.trim() || !variableSet.expression.trim()) continue;
    lines.push(`@set ${variableSet.key.trim()}=${variableSet.expression.trim()}`);
  }

  lines.push(`${step.method.toUpperCase()} ${step.url.trim()}`);

  const headers = headerLines(step.headers);
  lines.push(...headers);

  if (step.body.trim()) {
    lines.push('');
    lines.push(step.body);
  }

  return lines.join('\n');
}

function exportWaitStep(step: Extract<FlowStep, { kind: 'wait' }>): string {
  const lines: string[] = [];
  if (step.stepName.trim()) lines.push(`@name ${step.stepName.trim()}`);
  lines.push(`@wait ${step.seconds.trim() || '1'}`);
  return lines.join('\n');
}

function exportPauseStep(step: Extract<FlowStep, { kind: 'pause' }>): string {
  const lines: string[] = [];
  if (step.stepName.trim()) lines.push(`@name ${step.stepName.trim()}`);
  lines.push(`@wait_for_continue ${step.label.trim() || 'Continue'}`);
  return lines.join('\n');
}

export function exportHttpFlow(steps: FlowStep[]): string {
  return steps
    .map((step) => {
      if (step.kind === 'request') return exportRequestStep(step);
      if (step.kind === 'wait') return exportWaitStep(step);
      return exportPauseStep(step);
    })
    .join('\n\n###\n\n');
}
