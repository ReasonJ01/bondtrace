import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { JsonCodeBlock } from './JsonCodeBlock';
import { loadOpenApiDocument } from '../utils/openapi';
import { exportHttpFlow } from '../utils/httpFlowExport';
import { SPEC_CONFIG, type SpecConfig } from '../config/specs';
import type {
  FlowHeader,
  FlowStep,
  FlowVariableSet,
  OpenApiImportResult,
  OpenApiOperation,
  PauseFlowStep,
  RequestFlowStep,
  WaitFlowStep,
} from '../types/flow-builder';

function makeHeader(name = '', value = ''): FlowHeader {
  return { id: crypto.randomUUID(), name, value };
}

function makeVariableSet(key = '', expression = ''): FlowVariableSet {
  return { id: crypto.randomUUID(), key, expression };
}

function makeRequestStep(operation: OpenApiOperation, specConfig: SpecConfig, servers: string[]): RequestFlowStep {
  const baseUrl = servers[0] ?? '';
  let url = operation.defaultUrl;
  if (specConfig.baseUrlVar) {
    let pathPart: string;
    try {
      const parsed = new URL(operation.defaultUrl, 'http://dummy');
      pathPart = decodeURI(parsed.pathname) + parsed.search + parsed.hash;
      if (!pathPart.startsWith('/')) pathPart = '/' + pathPart;
    } catch {
      pathPart = operation.defaultUrl.startsWith('/') ? operation.defaultUrl : '/' + operation.defaultUrl;
    }
    url = `{{${specConfig.baseUrlVar}}}${pathPart}`;
  }
  return {
    id: crypto.randomUUID(),
    kind: 'request',
    stepName: operation.id,
    method: operation.method,
    url,
    headers: operation.defaultHeaders.map((header) => ({ ...header, id: crypto.randomUUID() })),
    body: operation.defaultBody,
    sourceOperationId: operation.id,
    sourceSpecId: specConfig.id,
    baseUrlVar: specConfig.baseUrlVar,
    authMode: specConfig.authMode,
    variableSets: [],
  };
}

function makeBlankRequestStep(): RequestFlowStep {
  return {
    id: crypto.randomUUID(),
    kind: 'request',
    stepName: `request_${Date.now()}`,
    method: 'GET',
    url: '',
    headers: [],
    body: '',
    authMode: 'none',
    variableSets: [],
  };
}

function makeWaitStep(): WaitFlowStep {
  return {
    id: crypto.randomUUID(),
    kind: 'wait',
    stepName: `wait_${Date.now()}`,
    seconds: '5',
  };
}

function makePauseStep(): PauseFlowStep {
  return {
    id: crypto.randomUUID(),
    kind: 'pause',
    stepName: `pause_${Date.now()}`,
    label: 'Continue',
  };
}

function buttonStyle(primary = false): CSSProperties {
  return {
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: primary ? 'var(--text-primary)' : 'var(--bg-elevated)',
    color: primary ? 'var(--bg-primary)' : 'var(--text-primary)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 14,
  };
}

function inputStyle(multiline = false): CSSProperties {
  return {
    width: '100%',
    padding: multiline ? '4px 8px' : '4px 8px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    fontSize: 14,
    resize: multiline ? 'vertical' : undefined,
  };
}

function panelStyle(): CSSProperties {
  return {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 12,
  };
}

export function FlowBuilder({ onBackToPlayback }: { onBackToPlayback: () => void }) {
  const [specsData, setSpecsData] = useState<Record<string, OpenApiImportResult>>({});
  const [activeTab, setActiveTab] = useState<string>(SPEC_CONFIG[0]?.id ?? '');
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draggingStepId, setDraggingStepId] = useState<string | null>(null);
  const [dragOverStepId, setDragOverStepId] = useState<string | null>(null);
  const [exportPreviewExpanded, setExportPreviewExpanded] = useState(false);

  const activeSpecConfig = SPEC_CONFIG.find((c) => c.id === activeTab) ?? SPEC_CONFIG[0];
  const documentInfo = activeSpecConfig ? specsData[activeSpecConfig.id] ?? null : null;

  useEffect(() => {
    let cancelled = false;
    async function loadSpecs() {
      setLoadError(null);
      const results: Record<string, OpenApiImportResult> = {};
      for (const config of SPEC_CONFIG) {
        try {
          const res = await fetch(config.file);
          if (!res.ok) throw new Error(`${config.file}: ${res.status}`);
          const text = await res.text();
          const imported = await loadOpenApiDocument(text);
          if (!cancelled) results[config.id] = imported;
        } catch (err) {
          if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load specs');
        }
      }
      if (!cancelled) setSpecsData(results);
    }
    loadSpecs();
    return () => { cancelled = true; };
  }, []);

  const selectedStep = steps.find((step) => step.id === selectedStepId) ?? null;
  const exportedFlow = useMemo(() => exportHttpFlow(steps), [steps]);

  const filteredOperations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!documentInfo) return [];
    if (!term) return documentInfo.operations;
    return documentInfo.operations.filter((operation) =>
      `${operation.title} ${operation.method} ${operation.path} ${operation.id}`.toLowerCase().includes(term)
    );
  }, [documentInfo, search]);

  function updateStep(stepId: string, updater: (step: FlowStep) => FlowStep) {
    setSteps((current) => current.map((step) => (step.id === stepId ? updater(step) : step)));
  }

  function moveStep(sourceId: string, targetId: string) {
    setSteps((current) => {
      const sourceIndex = current.findIndex((step) => step.id === sourceId);
      const targetIndex = current.findIndex((step) => step.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current;
      const next = [...current];
      const [removed] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, removed);
      return next;
    });
  }

  function addRequestStep(operation: OpenApiOperation) {
    if (!activeSpecConfig || !documentInfo) return;
    const nextStep = makeRequestStep(operation, activeSpecConfig, documentInfo.servers);
    setSteps((current) => [...current, nextStep]);
    setSelectedStepId(nextStep.id);
  }

  function addBlankRequestStep() {
    const nextStep = makeBlankRequestStep();
    setSteps((current) => [...current, nextStep]);
    setSelectedStepId(nextStep.id);
  }

  function addWaitStep() {
    const nextStep = makeWaitStep();
    setSteps((current) => [...current, nextStep]);
    setSelectedStepId(nextStep.id);
  }

  function addPauseStep() {
    const nextStep = makePauseStep();
    setSteps((current) => [...current, nextStep]);
    setSelectedStepId(nextStep.id);
  }

  function removeStep(stepId: string) {
    setSteps((current) => current.filter((step) => step.id !== stepId));
    if (selectedStepId === stepId) setSelectedStepId(null);
  }

  function downloadFlow() {
    const blob = new Blob([exportedFlow], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(documentInfo?.title ?? 'flow').replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()}.http`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function getSpecForStep(step: RequestFlowStep): SpecConfig | undefined {
    if (step.sourceSpecId) return SPEC_CONFIG.find((c) => c.id === step.sourceSpecId);
    return undefined;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        padding: 16,
        fontSize: 14,
      }}
    >
        <div style={{ maxWidth: 1480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
        <div style={{ ...panelStyle(), display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Flow Builder</div>
            <h1 style={{ margin: 0, fontSize: 20, lineHeight: 1.05, fontWeight: 600 }}>OpenAPI to Bondtrace `.http`</h1>
            <div style={{ color: 'var(--text-secondary)', maxWidth: 760 }}>
              Choose operations from each API tab, mix in wait steps, reorder the timeline, and export a recorder-ready `.http` flow.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <button onClick={downloadFlow} disabled={steps.length === 0} style={{ ...buttonStyle(), opacity: steps.length === 0 ? 0.45 : 1 }}>
              Download .http
            </button>
            <button onClick={onBackToPlayback} style={buttonStyle()}>
              Back to playback
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, minHeight: 0, alignItems: 'start' }}>
          <section style={{ ...panelStyle(), display: 'flex', flexDirection: 'column', gap: 12, height: 520, overflow: 'hidden' }}>
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Spec browser</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 8 }}>
                Add requests from the OpenAPI doc or insert wait/pause steps.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', paddingBottom: 0, flexShrink: 0 }}>
              {SPEC_CONFIG.map((config) => (
                <button
                  key={config.id}
                  onClick={() => setActiveTab(config.id)}
                  style={{
                    ...buttonStyle(),
                    border: 'none',
                    borderBottom: activeTab === config.id ? '2px solid var(--text-primary)' : '2px solid transparent',
                    borderRadius: 0,
                    marginBottom: -1,
                    background: activeTab === config.id ? 'var(--bg-tertiary)' : 'transparent',
                  }}
                >
                  {config.label}
                </button>
              ))}
            </div>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search operations"
              style={{ ...inputStyle(), flexShrink: 0 }}
            />

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
              <button onClick={addBlankRequestStep} style={buttonStyle()}>
                Add blank request
              </button>
              <button onClick={addWaitStep} style={buttonStyle()}>
                Add wait
              </button>
              <button onClick={addPauseStep} style={buttonStyle()}>
                Add continue pause
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto', overflowX: 'hidden', paddingRight: 2, flex: 1, minHeight: 0 }}>
              {filteredOperations.map((operation) => (
                <button
                  key={`${operation.method}:${operation.path}:${operation.id}`}
                  onClick={() => addRequestStep(operation)}
                  style={{
                    textAlign: 'left',
                    padding: 6,
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <strong style={{ fontSize: 'inherit' }}>{operation.title}</strong>
                    <span style={{ color: 'var(--text-secondary)' }}>{operation.method}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2 }}>{operation.path}</div>
                  {operation.description ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 2 }}>{operation.description}</div>
                  ) : null}
                </button>
              ))}
              {!documentInfo && !loadError && <div style={{ color: 'var(--text-secondary)' }}>Loading specs...</div>}
              {loadError && <div style={{ color: 'var(--text-secondary)' }}>{loadError}</div>}
              {documentInfo && filteredOperations.length === 0 && search && (
                <div style={{ color: 'var(--text-secondary)' }}>No operations match.</div>
              )}
            </div>
          </section>

          <section style={{ ...panelStyle(), display: 'flex', flexDirection: 'column', gap: 12, height: 520, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 2, fontSize: 14 }}>Flow steps</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  Drag to reorder. Click a step to edit it.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto', overflowX: 'hidden', paddingRight: 2, flex: 1, minHeight: 0 }}>
              {steps.map((step, index) => {
                const isSelected = step.id === selectedStepId;
                const isDragging = step.id === draggingStepId;
                const isDropTarget = step.id === dragOverStepId && draggingStepId && draggingStepId !== step.id;
                return (
                  <div
                    key={step.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', step.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggingStepId(step.id);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (draggingStepId && draggingStepId !== step.id) setDragOverStepId(step.id);
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      if (draggingStepId && draggingStepId !== step.id) setDragOverStepId(step.id);
                    }}
                    onDragLeave={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const { clientX, clientY } = e;
                      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
                        setDragOverStepId(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const sourceId = e.dataTransfer.getData('text/plain');
                      if (sourceId && sourceId !== step.id) moveStep(sourceId, step.id);
                      setDraggingStepId(null);
                      setDragOverStepId(null);
                    }}
                    onDragEnd={() => {
                      setDraggingStepId(null);
                      setDragOverStepId(null);
                    }}
                    onClick={() => setSelectedStepId(step.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'stretch',
                      padding: 0,
                      minWidth: 0,
                      borderRadius: 8,
                      border: isDropTarget
                        ? '2px dashed var(--text-muted)'
                        : isSelected
                          ? '1px solid var(--text-muted)'
                          : '1px solid var(--border)',
                      background: isDropTarget
                        ? 'color-mix(in srgb, var(--text-muted) 8%, var(--bg-secondary))'
                        : isSelected
                          ? 'var(--bg-tertiary)'
                          : 'var(--bg-secondary)',
                      cursor: 'grab',
                      opacity: isDragging ? 0.5 : 1,
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        padding: '6px 4px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRight: '1px solid var(--border)',
                        borderRadius: '8px 0 0 8px',
                        cursor: 'grab',
                        color: 'var(--text-muted)',
                      }}
                      title="Drag to reorder"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ display: 'block' }}>
                        <circle cx="4" cy="3" r="1" />
                        <circle cx="8" cy="3" r="1" />
                        <circle cx="4" cy="6" r="1" />
                        <circle cx="8" cy="6" r="1" />
                        <circle cx="4" cy="9" r="1" />
                        <circle cx="8" cy="9" r="1" />
                      </svg>
                    </div>
                    <div style={{ flex: 1, padding: 10, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            {step.kind === 'request' ? step.method : step.kind}
                          </span>
                          <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {step.stepName || `step_${index + 1}`}
                          </strong>
                        </div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            removeStep(step.id);
                          }}
                          style={{ ...buttonStyle(), padding: '4px 8px' }}
                        >
                          Remove
                        </button>
                      </div>
                      <div
                        style={{
                          color: 'var(--text-secondary)',
                          fontSize: 'var(--font-size-sm)',
                          marginTop: 4,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={step.kind === 'request' ? step.url : undefined}
                      >
                        {step.kind === 'request' ? step.url : step.kind === 'wait' ? `${step.seconds}s delay` : step.label}
                      </div>
                    </div>
                  </div>
                );
              })}
              {steps.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)' }}>No steps yet. Add requests or waits from the left column.</div>
              ) : null}
            </div>
          </section>

          <section style={{ ...panelStyle(), display: 'flex', flexDirection: 'column', gap: 12, height: 520, overflow: 'hidden' }}>
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontWeight: 600, marginBottom: 2, fontSize: 14 }}>Step editor</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 8 }}>
                {selectedStep ? (
                  selectedStep.kind === 'request' ? (
                    'Request: HTTP method, URL, auth, headers, body. Optionally capture response values with @set.'
                  ) : selectedStep.kind === 'wait' ? (
                    'Wait: Pause the flow for a number of seconds before the next step.'
                  ) : (
                    'Pause: Wait for user to click Continue before proceeding.'
                  )
                ) : (
                  'Select a step to edit. Request = HTTP call with optional @set capture. Wait = delay. Pause = manual continue.'
                )}
              </div>
            </div>

            {selectedStep ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0, overflow: 'auto' }}>
                <div>
                  <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>Step name</div>
                  <input
                    value={selectedStep.stepName}
                    onChange={(event) => updateStep(selectedStep.id, (step) => ({ ...step, stepName: event.target.value } as FlowStep))}
                    style={inputStyle()}
                  />
                </div>

                {selectedStep.kind === 'request' ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8 }}>
                      <input
                        value={selectedStep.method}
                        onChange={(event) =>
                          updateStep(selectedStep.id, (step) => ({ ...(step as RequestFlowStep), method: event.target.value.toUpperCase() }))
                        }
                        placeholder="GET"
                        style={inputStyle()}
                      />
                      <input
                        value={selectedStep.url}
                        onChange={(event) =>
                          updateStep(selectedStep.id, (step) => ({ ...(step as RequestFlowStep), url: event.target.value }))
                        }
                        style={inputStyle()}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>Base URL variable</div>
                        <select
                          value={
                            selectedStep.baseUrlVar ??
                            (selectedStep.url.match(/\{\{([^}]+)\}\}/)?.[1] ?? '')
                          }
                          onChange={(event) => {
                            const baseUrlVar = event.target.value || undefined;
                            const url = selectedStep.url.trim();
                            if (baseUrlVar) {
                              const baseMatch = url.match(/^\{\{[^}]+\}\}(.*)$/);
                              const pathPart = baseMatch
                                ? (baseMatch[1] || '/').replace(/%7B/g, '{').replace(/%7D/g, '}')
                                : (() => {
                                    try {
                                      const parsed = new URL(url);
                                      return decodeURI(parsed.pathname) + parsed.search + parsed.hash;
                                    } catch {
                                      return (url.startsWith('/') ? url : '/' + url).replace(/%7B/g, '{').replace(/%7D/g, '}');
                                    }
                                  })();
                              const newUrl = `{{${baseUrlVar}}}${pathPart}`;
                              updateStep(selectedStep.id, (step) => ({ ...(step as RequestFlowStep), url: newUrl, baseUrlVar }));
                            } else {
                              const spec = getSpecForStep(selectedStep);
                              const specDoc = spec ? specsData[spec.id] : null;
                              const base = specDoc?.servers?.[0] ?? '';
                              const currentVar = selectedStep.baseUrlVar ?? url.match(/\{\{([^}]+)\}\}/)?.[1];
                              const newUrl = currentVar
                                ? url.replace(new RegExp(`\\{\\{${currentVar}\\}\\}`, 'g'), base).replace(/\/+/g, '/')
                                : url;
                              updateStep(selectedStep.id, (step) => ({ ...(step as RequestFlowStep), url: newUrl, baseUrlVar: undefined }));
                            }
                          }}
                          style={inputStyle()}
                        >
                          <option value="">None (full URL)</option>
                          {SPEC_CONFIG.map((c) => (
                            <option key={c.id} value={c.baseUrlVar}>
                              {c.baseUrlVar}
                            </option>
                          ))}
                        </select>
                      </div>

                    <div>
                      <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>Auth</div>
                      <select
                        value={selectedStep.authMode}
                        onChange={(event) =>
                          updateStep(selectedStep.id, (step) => ({
                            ...(step as RequestFlowStep),
                            authMode: event.target.value as 'none' | 'client' | 'ops',
                          }))
                        }
                        style={inputStyle()}
                      >
                        <option value="none">None</option>
                        <option value="client">Client credentials (client_token)</option>
                        <option value="ops">Ops / implicit (ops_token)</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 600 }}>Headers</div>
                        <button
                          onClick={() =>
                            updateStep(selectedStep.id, (step) => ({
                              ...(step as RequestFlowStep),
                              headers: [...(step as RequestFlowStep).headers, makeHeader()],
                            }))
                          }
                          style={buttonStyle()}
                        >
                          Add header
                        </button>
                      </div>
                      {selectedStep.headers.map((header) => (
                        <div key={header.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6 }}>
                          <input
                            value={header.name}
                            onChange={(event) =>
                              updateStep(selectedStep.id, (step) => ({
                                ...(step as RequestFlowStep),
                                headers: (step as RequestFlowStep).headers.map((item) =>
                                  item.id === header.id ? { ...item, name: event.target.value } : item
                                ),
                              }))
                            }
                            placeholder="Header"
                            style={inputStyle()}
                          />
                          <input
                            value={header.value}
                            onChange={(event) =>
                              updateStep(selectedStep.id, (step) => ({
                                ...(step as RequestFlowStep),
                                headers: (step as RequestFlowStep).headers.map((item) =>
                                  item.id === header.id ? { ...item, value: event.target.value } : item
                                ),
                              }))
                            }
                            placeholder="Value"
                            style={inputStyle()}
                          />
                          <button
                            onClick={() =>
                              updateStep(selectedStep.id, (step) => ({
                                ...(step as RequestFlowStep),
                                headers: (step as RequestFlowStep).headers.filter((item) => item.id !== header.id),
                              }))
                            }
                            style={{ ...buttonStyle(), padding: '6px 8px' }}
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ fontWeight: 600 }}>Captured variables</div>
                        <button
                          onClick={() =>
                            updateStep(selectedStep.id, (step) => ({
                              ...(step as RequestFlowStep),
                              variableSets: [...(step as RequestFlowStep).variableSets, makeVariableSet()],
                            }))
                          }
                          style={buttonStyle()}
                        >
                          Add @set
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {selectedStep.variableSets.map((variableSet) => (
                          <div key={variableSet.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6 }}>
                            <input
                              value={variableSet.key}
                              onChange={(event) =>
                                updateStep(selectedStep.id, (step) => ({
                                  ...(step as RequestFlowStep),
                                  variableSets: (step as RequestFlowStep).variableSets.map((item) =>
                                    item.id === variableSet.id ? { ...item, key: event.target.value } : item
                                  ),
                                }))
                              }
                              placeholder="variable_name"
                              style={inputStyle()}
                            />
                            <input
                              value={variableSet.expression}
                              onChange={(event) =>
                                updateStep(selectedStep.id, (step) => ({
                                  ...(step as RequestFlowStep),
                                  variableSets: (step as RequestFlowStep).variableSets.map((item) =>
                                    item.id === variableSet.id ? { ...item, expression: event.target.value } : item
                                  ),
                                }))
                              }
                              placeholder="{{response.body.id}}"
                              style={inputStyle()}
                            />
                            <button
                              onClick={() =>
                                updateStep(selectedStep.id, (step) => ({
                                  ...(step as RequestFlowStep),
                                  variableSets: (step as RequestFlowStep).variableSets.filter((item) => item.id !== variableSet.id),
                                }))
                              }
                              style={{ ...buttonStyle(), padding: '6px 8px' }}
                            >
                              x
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Body</div>
                      <textarea
                        value={selectedStep.body}
                        onChange={(event) =>
                          updateStep(selectedStep.id, (step) => ({ ...(step as RequestFlowStep), body: event.target.value }))
                        }
                        rows={12}
                        style={inputStyle(true)}
                      />
                    </div>
                  </>
                ) : null}

                {selectedStep.kind === 'wait' ? (
                  <div>
                    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>Seconds</div>
                    <input
                      value={selectedStep.seconds}
                      onChange={(event) =>
                        updateStep(selectedStep.id, (step) => ({ ...(step as WaitFlowStep), seconds: event.target.value }))
                      }
                      style={inputStyle()}
                    />
                  </div>
                ) : null}

                {selectedStep.kind === 'pause' ? (
                  <div>
                    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>Continue label</div>
                    <input
                      value={selectedStep.label}
                      onChange={(event) =>
                        updateStep(selectedStep.id, (step) => ({ ...(step as PauseFlowStep), label: event.target.value }))
                      }
                      style={inputStyle()}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)', flex: 1 }}>Select a step to edit its fields.</div>
            )}

            <div style={{ marginTop: 'auto', flexShrink: 0, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <button
                type="button"
                onClick={() => setExportPreviewExpanded((v) => !v)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  padding: '4px 0',
                  border: 'none',
                  background: 'none',
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ transform: exportPreviewExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                Export preview
              </button>
              {exportPreviewExpanded && (
                <div style={{ marginTop: 6 }}>
                  <JsonCodeBlock content={exportedFlow || '# Add steps to generate your .http flow'} language="plain" />
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
