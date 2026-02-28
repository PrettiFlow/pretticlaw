declare module "ws" {
  export type RawData = string | Buffer | ArrayBuffer | Buffer[];

  type Listener = (...args: any[]) => void;

  export default class WebSocket {
    static readonly OPEN: number;
    readonly readyState: number;
    constructor(url: string);
    on(event: "message", listener: (data: RawData) => void): this;
    on(event: "close" | "error" | string, listener: Listener): this;
    send(data: string | Buffer): void;
    close(): void;
  }
}
