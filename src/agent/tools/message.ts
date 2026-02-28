import { Tool } from "./base.js";
import type { OutboundMessage } from "../../bus/events.js";

export class MessageTool extends Tool {
  readonly name = "message";
  readonly description = "Send a message to the user. Use this when you want to communicate something.";
  readonly parameters = {
    type: "object",
    properties: {
      content: { type: "string", description: "The message content to send" },
      channel: { type: "string", description: "Optional target channel" },
      chat_id: { type: "string", description: "Optional target chat/user ID" },
      media: { type: "array", items: { type: "string" }, description: "Optional file attachments" },
    },
    required: ["content"],
  };

  private defaultChannel = "";
  private defaultChatId = "";
  private defaultMessageId: string | null = null;
  sentInTurn = false;

  constructor(private sendCallback?: (msg: OutboundMessage) => Promise<void>) { super(); }

  setContext(channel: string, chatId: string, messageId?: string): void {
    this.defaultChannel = channel;
    this.defaultChatId = chatId;
    this.defaultMessageId = messageId ?? null;
  }

  setSendCallback(cb: (msg: OutboundMessage) => Promise<void>): void {
    this.sendCallback = cb;
  }

  startTurn(): void {
    this.sentInTurn = false;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const content = String(args.content ?? "");
    const channel = String(args.channel ?? this.defaultChannel);
    const chatId = String(args.chat_id ?? this.defaultChatId);
    const messageId = String(args.message_id ?? this.defaultMessageId ?? "");
    const media = Array.isArray(args.media) ? (args.media as string[]) : [];

    if (!channel || !chatId) return "Error: No target channel/chat specified";
    if (!this.sendCallback) return "Error: Message sending not configured";

    try {
      await this.sendCallback({ channel, chatId, content, media, metadata: { message_id: messageId } });
      if (channel === this.defaultChannel && chatId === this.defaultChatId) this.sentInTurn = true;
      return `Message sent to ${channel}:${chatId}${media.length ? ` with ${media.length} attachments` : ""}`;
    } catch (err) {
      return `Error sending message: ${String(err)}`;
    }
  }
}
