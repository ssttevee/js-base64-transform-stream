const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const variants = {
  std: { chars: "+/", padding: 61 },
  url: { chars: "-_", padding: null },
};

function write6(charset, buf, val) {
  buf[0] = charset[(val >> 18) & 0b111111];
  buf[1] = charset[(val >> 12) & 0b111111];
  buf[2] = charset[(val >> 6) & 0b111111];
  buf[3] = charset[val & 0b111111];
}

export class Base64EncoderStream extends TransformStream {
  constructor(variant = "std") {
    const charset = new TextEncoder().encode(chars + variants[variant].chars);
    const padding = variants[variant].padding;

    super({
      start() {
        this.saved = new Uint8Array(0);
      },
      transform(chunk, controller) {
        const saved = this.saved;
        if (saved.length + chunk.length < 3) {
          this.saved = new Uint8Array([...saved, ...chunk]);
        } else {
          this.saved = chunk.slice(
            Math.floor((saved.length + chunk.length) / 3) * 3 - saved.length,
          );

          const buf = new Uint8Array(
            Math.floor((saved.length + chunk.length - this.saved.length) / 3) *
              4,
          );

          let pos = 0;
          let val = 0;
          for (const bytes of [
            saved,
            chunk.slice(0, chunk.length - this.saved.length),
          ]) {
            for (const byte of bytes) {
              val = (val << 8) | byte;

              if (!(++pos % 3)) {
                write6(charset, buf.subarray((pos / 3 - 1) * 4), val);
              }
            }
          }

          controller.enqueue(buf);
        }
      },
      flush(controller) {
        const saved = this.saved;
        if (saved.length) {
          let val = 0;
          for (const byte of saved) {
            val = (val << 8) | byte;
          }

          for (let i = 3 - saved.length; i > 0; i--) {
            val = val << 8;
          }

          const buf = new Uint8Array(4);
          write6(charset, buf, val);

          if (padding) {
            for (let i = saved.length + 1; i < 4; i++) {
              buf[i] = padding;
            }

            controller.enqueue(buf);
          } else {
            controller.enqueue(buf.slice(0, saved.length + 1));
          }
        }
      },
    });
  }
}

function countPadding(padding, buf) {
  let n = 0;
  for (let i = buf.length - 1; i >= 0 && buf[i] === padding; i--) {
    n++;
  }

  return n;
}

export class Base64DecoderStream extends TransformStream {
  constructor(variant = "std") {
    const charset = Object.fromEntries(
      Object.entries(
        new TextEncoder().encode(chars + variants[variant].chars),
      ).map(([i, v]) => [v, i]),
    );
    const padding = variants[variant].padding;

    super({
      start() {
        this.saved = new Uint8Array(0);
      },
      /**
       * @param {Uint8Array} chunk
       * @param {TransformStreamDefaultController<Uint8Array>} controller
       */
      transform(chunk, controller) {
        const saved = this.saved;
        const realLength =
          chunk.length - (padding ? countPadding(padding, chunk) : 0);

        if (saved.length + realLength < 4) {
          this.saved = new Uint8Array([...saved, ...chunk]);
        } else {
          this.saved = chunk.slice(
            Math.floor((saved.length + realLength) / 4) * 4 - saved.length,
          );

          const buf = new Uint8Array(
            Math.floor((saved.length + chunk.length - this.saved.length) / 4) *
              3,
          );

          let pos = 0;
          let val = 0;
          for (const bytes of [
            saved,
            chunk.slice(0, chunk.length - this.saved.length),
          ]) {
            for (const byte of bytes) {
              val = (val << 6) | charset[byte];

              if (!(++pos % 4)) {
                const offset = (pos / 4 - 1) * 3;
                buf[offset + 0] = (val >> 16) & 0xff;
                buf[offset + 1] = (val >> 8) & 0xff;
                buf[offset + 2] = val & 0xff;
              }
            }
          }

          controller.enqueue(buf);
        }
      },
      flush(controller) {
        let saved = this.saved;
        if (padding) {
          while (saved[saved.length - 1] === padding) {
            saved = saved.slice(0, saved.length - 1);
          }
        }

        if (saved.length) {
          let val = 0;
          for (const byte of saved) {
            val = (val << 6) | charset[byte];
          }

          for (let i = 4 - saved.length; i > 0; i--) {
            val = val << 6;
          }

          if (saved.length === 1) {
            throw new Error("Invalid base64 string");
          }

          const bytes = [(val >> 16) & 0xff];
          if (saved.length >= 3) {
            bytes.push((val >> 8) & 0xff);
          }

          if (saved.length >= 4) {
            bytes.push(val & 0xff);
          }

          controller.enqueue(new Uint8Array(bytes));
        }
      },
    });
  }
}
