// The personal site exposes one named model backed by the configured MaaS API.
export const CHAT_MODELS = [
  { id: 'deepseek-v4-flash', name: 'mingzev1.0' },
];
export const CHAT_EFFORTS = ['off', 'low', 'high', 'max'];
export const DEFAULT_SELECTION = { model: 'deepseek-v4-flash', reasoningEffort: 'off' };
export function validSelection(value) {
  return CHAT_MODELS.some(model => model.id === value?.model)
    && CHAT_EFFORTS.includes(value?.reasoningEffort);
}

// Retain a saved effort while migrating older model choices to the sole site model.
export function normalizeSelection(value) {
  return {model:DEFAULT_SELECTION.model,reasoningEffort:CHAT_EFFORTS.includes(value?.reasoningEffort)?value.reasoningEffort:DEFAULT_SELECTION.reasoningEffort};
}
