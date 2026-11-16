import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

export function createOperatorPrompts(input, terminal) {
  let hidden = false;
  const output = new Writable({
    write(chunk, encoding, done) {
      if (!hidden) terminal.write(chunk, encoding);
      done();
    },
  });
  output.isTTY = true;
  output.columns = terminal.columns;
  const prompts = createInterface({ input, output, terminal: true });
  const abort = new AbortController();
  prompts.on("SIGINT", () => abort.abort());
  prompts.on("close", () => abort.abort());
  return {
    async question(label, secret = false) {
      const answer = prompts.question(label, { signal: abort.signal });
      hidden = secret;
      try { return await answer; }
      finally {
        if (secret) prompts.history = [];
        hidden = false;
        if (secret) terminal.write("\n");
      }
    },
    close() { prompts.close(); output.end(); },
  };
}
