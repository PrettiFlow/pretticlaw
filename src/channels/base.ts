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

  private static readonly channelColors: Record<string, string> = {
    telegram: "\x1b[36m",
    discord: "\x1b[35m",
    whatsapp: "\x1b[32m",
    slack: "\x1b[33m",
    email: "\x1b[34m",
  };

  protected async handleMessage(input: { senderId: string; chatId: string; content: string; media?: string[]; metadata?: Record<string, unknown>; sessionKey?: string }): Promise<void> {
    const color = BaseChannel.channelColors[this.name] ?? "\x1b[0m";
    const preview = input.content.length > 80 ? input.content.slice(0, 80) + "…" : input.content;
    if (!this.isAllowed(input.senderId)) {
      console.log(`[${color}${this.name}\x1b[0m] \x1b[31mBLOCKED\x1b[0m from=${input.senderId}`);
      return;
    }
    console.log(`[${color}${this.name}\x1b[0m] from=${input.senderId} chat=${input.chatId} "${preview}"`);
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
