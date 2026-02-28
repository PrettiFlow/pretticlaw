import type { MessageBus } from "../bus/queue.js";
import type { OutboundMessage } from "../bus/events.js";

export abstract class BaseChannel<TConfig = unknown> {
  protected running = false;
  constructor(protected readonly config: TConfig, protected readonly bus: MessageBus) {}
  abstract readonly name: string;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(msg: OutboundMessage): Promise<void>;

  protected isAllowed(senderId: string): boolean {
    const allowFrom: string[] = ((this.config as any)?.allowFrom ?? []) as string[];
    if (!allowFrom.length) return true;
    if (allowFrom.includes(String(senderId))) return true;
    if (String(senderId).includes("|")) return String(senderId).split("|").some((p) => allowFrom.includes(p));
    return false;
  }

  protected async handleMessage(input: { senderId: string; chatId: string; content: string; media?: string[]; metadata?: Record<string, unknown>; sessionKey?: string }): Promise<void> {
    if (!this.isAllowed(input.senderId)) return;
    await this.bus.publishInbound({
      channel: this.name,
      senderId: String(input.senderId),
      chatId: String(input.chatId),
      content: input.content,
      media: input.media ?? [],
      metadata: input.metadata ?? {},
      sessionKeyOverride: input.sessionKey,
    });
  }

  get isRunning(): boolean {
    return this.running;
  }
}
