import type { Config } from "../config/schema.js";
import type { MessageBus } from "../bus/queue.js";
import type { OutboundMessage } from "../bus/events.js";
import type { BaseChannel } from "./base.js";
import { StubChannel } from "./stub.js";
import { TelegramChannel } from "./telegram.js";
import { DiscordChannel } from "./discord.js";

export class ChannelManager {
  readonly channels = new Map<string, BaseChannel>();
  private dispatchLoop: Promise<void> | null = null;
  private stopping = false;

  constructor(private readonly config: Config, private readonly bus: MessageBus) {
    this.initChannels();
  }

  private initChannels(): void {
    const add = (name: string, enabled: boolean, channelConfig: any) => {
      if (enabled) this.channels.set(name, new StubChannel(name, channelConfig, this.bus));
    };
    if (this.config.channels.telegram.enabled) {
      this.channels.set("telegram", new TelegramChannel(this.config.channels.telegram, this.bus));
    }
    add("whatsapp", this.config.channels.whatsapp.enabled, this.config.channels.whatsapp);
    if (this.config.channels.discord.enabled) {
      this.channels.set("discord", new DiscordChannel(this.config.channels.discord, this.bus));
    }
    add("feishu", this.config.channels.feishu.enabled, this.config.channels.feishu);
    add("mochat", this.config.channels.mochat.enabled, this.config.channels.mochat);
    add("dingtalk", this.config.channels.dingtalk.enabled, this.config.channels.dingtalk);
    add("email", this.config.channels.email.enabled, this.config.channels.email);
    add("slack", this.config.channels.slack.enabled, this.config.channels.slack);
    add("qq", this.config.channels.qq.enabled, this.config.channels.qq);
    add("matrix", this.config.channels.matrix.enabled, this.config.channels.matrix);
  }

  async startAll(): Promise<void> {
    if (!this.channels.size) return;
    this.stopping = false;
    this.dispatchLoop = this.dispatchOutbound();
    await Promise.all([...this.channels.values()].map((c) => c.start().catch(() => undefined)));
  }

  async stopAll(): Promise<void> {
    this.stopping = true;
    await Promise.all([...this.channels.values()].map((c) => c.stop().catch(() => undefined)));
  }

  private async dispatchOutbound(): Promise<void> {
    while (!this.stopping) {
      const msg = await this.bus.consumeOutbound();
      if (msg.metadata?._progress) {
        const isTool = !!msg.metadata._tool_hint;
        if (isTool && !this.config.channels.sendToolHints) continue;
        if (!isTool && !this.config.channels.sendProgress) continue;
      }
      const ch = this.channels.get(msg.channel);
      if (ch) await ch.send(msg as OutboundMessage).catch(() => undefined);
    }
  }

  get enabledChannels(): string[] {
    return [...this.channels.keys()];
  }

  getStatus(): Record<string, unknown> {
    return Object.fromEntries([...this.channels].map(([name, c]) => [name, { enabled: true, running: c.isRunning }]));
  }
}
