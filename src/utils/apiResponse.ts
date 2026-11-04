/** Keep transport parsing separate from endpoint-specific status and message policies. */
export async function readJsonOrEmpty<T extends object>(response: Response): Promise<Partial<T>> {
  return response.json().catch(() => ({})) as Promise<Partial<T>>;
}

export async function readJsonText<T extends object>(response: Response): Promise<
  { parsed: true; data: Partial<T> } | { parsed: false; text: string }
> {
  const text = await response.text();
  try {
    return { parsed: true, data: text ? JSON.parse(text) as T : {} };
  } catch {
    return { parsed: false, text };
  }
}
