import { AsyncQueue } from "./async-queue.js";
import type { InboundMessage, OutboundMessage } from "./events.js";

export class MessageBus {
  readonly inbound = new AsyncQueue<InboundMessage>();
  readonly outbound = new AsyncQueue<OutboundMessage>();

  async publishInbound(msg: InboundMessage): Promise<void> {
    this.inbound.push(msg);
  }

  async consumeInbound(): Promise<InboundMessage> {
    return this.inbound.pop();
  }

  async publishOutbound(msg: OutboundMessage): Promise<void> {
    this.outbound.push(msg);
  }

  async consumeOutbound(): Promise<OutboundMessage> {
    return this.outbound.pop();
  }

  get inboundSize(): number {
    return this.inbound.size();
  }

  get outboundSize(): number {
    return this.outbound.size();
  }
}
