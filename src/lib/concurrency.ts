export function createConcurrencyLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  function next() {
    if (active >= max || queue.length === 0) return;
    active++;
    const resolve = queue.shift()!;
    resolve();
  }

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<void>((res) => queue.push(res))
      .then(() => fn())
      .finally(() => { active--; next(); });
  };
}
