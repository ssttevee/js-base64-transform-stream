export type Base64Variant = "std" | "url";

export class Base64EncoderStream extends TransformStream {
  constructor(variant?: Base64Variant);
}

export class Base64DecoderStream extends TransformStream {
  constructor(variant?: Base64Variant);
}
