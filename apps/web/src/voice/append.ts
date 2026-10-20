/** What was said, after what is already written, a space between. */
export function appendSaid(current: string, said: string, limit: number): string {
  const heard = said.trim();
  if (heard === "") return current;
  const before = current.trimEnd();
  return (before === "" ? heard : `${before} ${heard}`).slice(0, limit);
}
