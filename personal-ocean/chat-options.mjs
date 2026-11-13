// The personal site exposes one named model backed by the official DeepSeek API.
export const CHAT_MODELS = [
  { id: 'deepseek-flash', name: 'Mingze-V1.0' },
];
export const CHAT_EFFORTS = ['off', 'low', 'medium', 'high', 'max'];
export const DEFAULT_SELECTION = { model: 'deepseek-flash', reasoningEffort: 'off' };
export function validSelection(value) {
  return CHAT_MODELS.some(model => model.id === value?.model)
    && CHAT_EFFORTS.includes(value?.reasoningEffort);
}

// Preserve explicit choices only for the current model; unknown models use the low-cost default.
export function normalizeSelection(value) {
  return validSelection(value)
    ? {model:DEFAULT_SELECTION.model,reasoningEffort:value.reasoningEffort}
    : {...DEFAULT_SELECTION};
}
