import { describe, expect, it } from 'vitest';
import {
  GENERATOR_PROTOCOL_VERSION,
  LineBuffer,
  parseGeneratorLine,
  type GeneratorRequest,
} from './generator-protocol.js';

/** Same v1 fixture the Rust `GenerateRequest::parse` tests deserialize. */
const V1_VECTOR_REQUEST: GeneratorRequest = {
  protocolVersion: GENERATOR_PROTOCOL_VERSION,
  jobId: '4b6b2d7e-7a1a-4b4e-9b3f-1b2c3d4e5f60',
  source: { type: 'pmtiles', path: '/data/master/master.pmtiles' },
  selection: {
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [7.4, 43.7],
          [7.45, 43.7],
          [7.45, 43.75],
          [7.4, 43.75],
          [7.4, 43.7],
        ],
      ],
    },
    minZoom: 0,
    maxZoom: 14,
  },
  output: {
    content: 'vector',
    container: 'mbtiles',
    path: '/data/exports/x/map.mbtiles',
    metadata: { name: 'Monaco', attribution: '© OSM' },
  },
  style: null,
  threads: 0,
};

describe('parseGeneratorLine', () => {
  it('parses every message type emitted by the Rust generator', () => {
    expect(parseGeneratorLine('{"type":"started","totalTiles":42}')).toEqual({ type: 'started', totalTiles: 42 });
    expect(parseGeneratorLine('{"type":"progress","completed":10,"total":42,"bytes":1234,"elapsedMs":250}')).toEqual({
      type: 'progress',
      completed: 10,
      total: 42,
      bytes: 1234,
      elapsedMs: 250,
    });
    expect(parseGeneratorLine('{"type":"packaging"}')).toEqual({ type: 'packaging' });
    expect(parseGeneratorLine('{"type":"completed","tiles":42,"bytes":99999,"elapsedMs":1200}')).toMatchObject({
      type: 'completed',
      tiles: 42,
    });
    expect(parseGeneratorLine('{"type":"failed","code":"TOO_MANY_TILES","message":"limit"}')).toEqual({
      type: 'failed',
      code: 'TOO_MANY_TILES',
      message: 'limit',
    });
    expect(parseGeneratorLine('{"type":"cancelled"}')).toEqual({ type: 'cancelled' });
  });

  it('ignores blank lines, invalid JSON and unknown or malformed messages', () => {
    expect(parseGeneratorLine('')).toBeNull();
    expect(parseGeneratorLine('   \r')).toBeNull();
    expect(parseGeneratorLine('not json')).toBeNull();
    expect(parseGeneratorLine('{"type":"bogus"}')).toBeNull();
    expect(parseGeneratorLine('{"type":"progress","completed":-1,"total":1}')).toBeNull();
    expect(parseGeneratorLine('{"type":"started","totalTiles":"42"}')).toBeNull();
  });
});

describe('LineBuffer', () => {
  it('splits chunks on newlines and keeps partial lines until flushed', () => {
    const buf = new LineBuffer();
    expect(buf.push('{"a":1}\n{"b"')).toEqual(['{"a":1}']);
    expect(buf.push(Buffer.from(':2}\n{"c":3}'))).toEqual(['{"b":2}']);
    expect(buf.flush()).toEqual(['{"c":3}']);
    expect(buf.flush()).toEqual([]);
  });

  it('handles multi-byte UTF-8 split across chunks when chunks are strings', () => {
    const buf = new LineBuffer();
    buf.push('{"message":"Monégasque');
    expect(buf.push('"}\n')).toEqual(['{"message":"Monégasque"}']);
  });
});

describe('v1 generate request fixture', () => {
  it('serializes the Node request the Rust generator deserializes', () => {
    const json = JSON.stringify(V1_VECTOR_REQUEST);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.protocolVersion).toBe(1);
    expect(parsed).toMatchObject({
      jobId: '4b6b2d7e-7a1a-4b4e-9b3f-1b2c3d4e5f60',
      source: { type: 'pmtiles', path: '/data/master/master.pmtiles' },
      selection: { minZoom: 0, maxZoom: 14 },
      output: { content: 'vector', container: 'mbtiles', path: '/data/exports/x/map.mbtiles' },
      style: null,
      threads: 0,
    });
    expect(json).toContain('"protocolVersion":1');
    expect(json).not.toContain('mbtiles" as content');
  });
});
