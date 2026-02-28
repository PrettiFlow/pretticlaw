import WebSocket, { type RawData } from "ws";
import type { OutboundMessage } from "../bus/events.js";
import type { MessageBus } from "../bus/queue.js";
import { BaseChannel } from "./base.js";

type DiscordConfig = {
  enabled: boolean;
  token: string;
  allowFrom: string[];
  gatewayUrl: string;
  intents: number;
};

type DiscordGatewayPayload = {
  op: number;
  d: any;
  s: number | null;
  t: string | null;
};

export class DiscordChannel extends BaseChannel<DiscordConfig> {
  readonly name = "discord";
  private ws: WebSocket | null = null;
  private hb: NodeJS.Timeout | null = null;
  private seq: number | null = null;

  constructor(config: DiscordConfig, bus: MessageBus) {
    super(config, bus);
  }

  async start(): Promise<void> {
    if (!this.config.token) {
      console.error("Discord token not configured");
      return;
    }

    this.running = true;
    while (this.running) {
      try {
        await this.connectOnce();
      } catch {
        // reconnect loop
      }
      if (this.running) await new Promise((r) => setTimeout(r, 2000));
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.hb) {
      clearInterval(this.hb);
      this.hb = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.config.token) return;
    await fetch(`https://discord.com/api/v10/channels/${msg.chatId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: msg.content || "" }),
    }).catch(() => undefined);
  }

  private async connectOnce(): Promise<void> {
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(this.config.gatewayUrl);
      this.ws = ws;

      ws.on("message", async (raw: RawData) => {
        let payload: DiscordGatewayPayload;
        try {
          payload = JSON.parse(raw.toString());
        } catch {
          return;
        }

        if (payload.s != null) this.seq = payload.s;

        if (payload.op === 10) {
          const interval = Number(payload.d?.heartbeat_interval ?? 30000);
          this.startHeartbeat(interval);
          this.sendPayload({
            op: 2,
            d: {
              token: this.config.token,
              intents: this.config.intents,
              properties: { os: process.platform, browser: "pretticlaw", device: "pretticlaw" },
            },
          });
          return;
        }

        if (payload.op === 7) {
          ws.close();
          return;
        }

        if (payload.op === 11) return;

        if (payload.t === "MESSAGE_CREATE") {
          const m = payload.d;
          if (!m || m.author?.bot) return;
          const content = String(m.content ?? "").trim();
          if (!content) return;
          const sender = `${m.author?.id}${m.author?.username ? `|${m.author.username}` : ""}`;
          await this.handleMessage({
            senderId: sender,
            chatId: String(m.channel_id),
            content,
            metadata: { message_id: m.id, guild_id: m.guild_id ?? null },
          });
        }
      });

      ws.on("close", () => {
        if (this.hb) {
          clearInterval(this.hb);
          this.hb = null;
        }
        resolve();
      });

      ws.on("error", () => {
        if (this.hb) {
          clearInterval(this.hb);
          this.hb = null;
        }
        resolve();
      });
    });
  }

  private startHeartbeat(intervalMs: number): void {
    if (this.hb) clearInterval(this.hb);
    this.hb = setInterval(() => {
      this.sendPayload({ op: 1, d: this.seq });
    }, intervalMs);
  }

  private sendPayload(data: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(data));
  }
}
