import assert from "node:assert/strict";
import test from "node:test";

import { Base64EncoderStream, Base64DecoderStream } from "./index.mjs";

function* groupings(bytes) {
  if (bytes.length === 0) {
    return;
  }

  for (let i = 1; i < bytes.length; i++) {
    for (const groups of groupings(bytes.slice(i))) {
      yield [bytes.slice(0, i), ...groups];
    }
  }

  yield [bytes];
}

async function compare(cls, variant, str, expected) {
  for (const parts of groupings(Uint8Array.from(str, (c) => c.charCodeAt(0)))) {
    assert.equal(
      String.fromCharCode(
        ...new Uint8Array(
          await new Response(
            new Blob(parts).stream().pipeThrough(new cls(variant)),
          ).arrayBuffer(),
        ),
      ),
      expected,
      `${variant}: failed grouping ${JSON.stringify(Array.from(parts, (chunk) => Array.from(chunk)))}`,
    );
  }
}

function stdToUrl(str) {
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function conv(v, str) {
  return v === "url" ? stdToUrl(str) : str;
}

const cases = {
  "length mod 3 is 0": [
    ["", ""],
    ["\0\0\0", "AAAA"],
    ["abc", "YWJj"],
    ["ÿÿÿ", "////"],
    ["\0\0\0\0\0\0", "AAAAAAAA"],
    ["abcdef", "YWJjZGVm"],
    ["ÿÿÿÿÿÿ", "////////"],
  ],
  "length mod 3 is 1": [
    ["\0", "AA=="],
    ["a", "YQ=="],
    ["ÿ", "/w=="],
    ["\0\0\0\0", "AAAAAA=="],
    ["abcd", "YWJjZA=="],
    ["ÿÿÿÿ", "/////w=="],
  ],
  "length mod 3 is 2": [
    ["\0\0", "AAA="],
    ["ab", "YWI="],
    ["ÿÿ", "//8="],
    ["\0\0\0\0\0", "AAAAAAA="],
    ["abcde", "YWJjZGU="],
    ["ÿÿÿÿÿ", "//////8="],
  ],
};

test("encoder", async (t) => {
  for (const v of ["std", "url"]) {
    await t.test(v, async (t) => {
      for (const [name, values] of Object.entries(cases)) {
        await t.test(name, async () => {
          for (const [str, expected] of values) {
            await compare(Base64EncoderStream, v, str, conv(v, expected));
          }
        });
      }
    });
  }
});

test("decoder", async (t) => {
  for (const v of ["std", "url"]) {
    await t.test(v, async (t) => {
      for (const [name, values] of Object.entries(cases)) {
        await t.test(name, async () => {
          for (const [expected, str] of values) {
            await compare(Base64DecoderStream, v, conv(v, str), expected);
          }
        });
      }
    });
  }
});
