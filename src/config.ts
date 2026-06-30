export function envFlag(name: string, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function envNumber(
  name: string,
  defaultValue: number,
  options: { min?: number; max?: number } = {}
) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return defaultValue;
  if (options.min !== undefined && value < options.min) return options.min;
  if (options.max !== undefined && value > options.max) return options.max;
  return value;
}

export function envList(name: string) {
  return (process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}
