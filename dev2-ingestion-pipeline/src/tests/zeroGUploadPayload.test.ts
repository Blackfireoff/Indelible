import { prepareStringForZeroGUpload } from "../adapters/storage/zeroGUploadPayload.js";

describe("prepareStringForZeroGUpload", () => {
  const prevMinify = process.env.ZEROG_UPLOAD_MINIFY_JSON;
  const prevPad = process.env.ZEROG_UPLOAD_PAD_MIN_BYTES;

  afterEach(() => {
    process.env.ZEROG_UPLOAD_MINIFY_JSON = prevMinify;
    process.env.ZEROG_UPLOAD_PAD_MIN_BYTES = prevPad;
  });

  it("pads short non-JSON to 2048 by default", () => {
    delete process.env.ZEROG_UPLOAD_MINIFY_JSON;
    delete process.env.ZEROG_UPLOAD_PAD_MIN_BYTES;
    const { payload, minified } = prepareStringForZeroGUpload('{"a":1}');
    expect(minified).toBe(false);
    expect(payload.length).toBe(2048);
    expect(payload.startsWith('{"a":1}')).toBe(true);
  });

  it("minifies pretty JSON when enabled", () => {
    process.env.ZEROG_UPLOAD_MINIFY_JSON = "true";
    delete process.env.ZEROG_UPLOAD_PAD_MIN_BYTES;
    const pretty = JSON.stringify({ x: 1, y: "z" }, null, 2);
    const { payload, minified } = prepareStringForZeroGUpload(pretty);
    expect(minified).toBe(true);
    expect(payload.startsWith('{"x":1,"y":"z"}')).toBe(true);
    expect(payload.length).toBe(2048);
  });
});
