import { EventEmitter } from "node:events";

export type LogLine = {
  ts: number;
  level: "info" | "error";
  message: string;
};

export class LogBus {
  private emitter = new EventEmitter();
  private ring: LogLine[] = [];
  constructor(private max = 500) {}

  push(line: LogLine) {
    this.ring.push(line);
    if (this.ring.length > this.max) this.ring.splice(0, this.ring.length - this.max);
    this.emitter.emit("line", line);
  }

  info(message: string) {
    this.push({ ts: Date.now(), level: "info", message });
  }

  error(message: string) {
    this.push({ ts: Date.now(), level: "error", message });
  }

  getBuffer() {
    return [...this.ring];
  }

  onLine(cb: (l: LogLine) => void) {
    this.emitter.on("line", cb);
    return () => this.emitter.off("line", cb);
  }
}
