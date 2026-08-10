export async function downloadWithPreservedSourceFallback<T>(input: {
  loadPrimary: () => Promise<T>;
  sourceAvailable: boolean;
  loadPreservedSource: () => Promise<T | null>;
}): Promise<T> {
  try {
    return await input.loadPrimary();
  } catch (primaryError) {
    if (!input.sourceAvailable) throw primaryError;
    const source = await input.loadPreservedSource();
    if (!source) throw primaryError;
    return source;
  }
}
