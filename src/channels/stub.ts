import type { OutboundMessage } from "../bus/events.js";
import type { MessageBus } from "../bus/queue.js";
import { BaseChannel } from "./base.js";

export class StubChannel extends BaseChannel<any> {
  constructor(public readonly name: string, config: any, bus: MessageBus) { super(config, bus); }

  async start(): Promise<void> {
    this.running = true;
    await new Promise<void>(() => {});
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async send(_msg: OutboundMessage): Promise<void> {
    // no-op
  }
}
