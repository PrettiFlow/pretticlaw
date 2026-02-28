export class AsyncQueue<T> {
  private items: T[] = [];
  private waiters: Array<(v: T) => void> = [];

  push(v: T): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(v);
    else this.items.push(v);
  }

  async pop(): Promise<T> {
    const item = this.items.shift();
    if (item !== undefined) return item;
    return new Promise<T>((resolve) => this.waiters.push(resolve));
  }

  size(): number {
    return this.items.length;
  }
}
