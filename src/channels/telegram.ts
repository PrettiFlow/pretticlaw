import type { OutboundMessage } from "../bus/events.js";
import type { MessageBus } from "../bus/queue.js";
import { BaseChannel } from "./base.js";

type TelegramConfig = {
  enabled: boolean;
  token: string;
  allowFrom: string[];
  proxy: string | null;
  replyToMessage: boolean;
};

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number | string };
    from?: { id: number | string; username?: string; is_bot?: boolean };
    text?: string;
    caption?: string;
  };
};

function splitMessage(content: string, maxLen = 4000): string[] {
  if (content.length <= maxLen) return [content];
  const chunks: string[] = [];
  let rest = content;
  while (rest.length > maxLen) {
    let cut = rest.slice(0, maxLen);
    let idx = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(" "));
    if (idx <= 0) idx = maxLen;
    chunks.push(rest.slice(0, idx));
    rest = rest.slice(idx).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export class TelegramChannel extends BaseChannel<TelegramConfig> {
  readonly name = "telegram";
  private offset = 0;

  constructor(config: TelegramConfig, bus: MessageBus) {
    super(config, bus);
  }

  private api(path: string): string {
    return `https://api.telegram.org/bot${this.config.token}/${path}`;
  }

  async start(): Promise<void> {
    if (!this.config.token) {
      console.error("Telegram token not configured");
      return;
    }

    this.running = true;
    while (this.running) {
      try {
        const url = new URL(this.api("getUpdates"));
        url.searchParams.set("timeout", "25");
        url.searchParams.set("offset", String(this.offset));
        url.searchParams.set("allowed_updates", JSON.stringify(["message"]));

        const res = await fetch(url);
        if (!res.ok) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }

        const data = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };
        if (!data.ok) continue;

        for (const update of data.result) {
          this.offset = update.update_id + 1;
          const msg = update.message;
          if (!msg) continue;
          if (msg.from?.is_bot) continue;

          const senderBase = String(msg.from?.id ?? "unknown");
          const sender = msg.from?.username ? `${senderBase}|@${msg.from.username}` : senderBase;
          const content = msg.text ?? msg.caption ?? "[Unsupported message]";

          await this.handleMessage({
            senderId: sender,
            chatId: String(msg.chat.id),
            content,
            metadata: { message_id: msg.message_id },
          });
        }
      } catch {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.config.token) return;
    const chunks = splitMessage(msg.content || "");
    for (const chunk of chunks) {
      const payload: Record<string, unknown> = {
        chat_id: msg.chatId,
        text: chunk,
      };

      const replyTo = msg.metadata?.message_id;
      if (this.config.replyToMessage && replyTo) payload.reply_parameters = { message_id: replyTo };

      await fetch(this.api("sendMessage"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => undefined);
    }
  }
}
