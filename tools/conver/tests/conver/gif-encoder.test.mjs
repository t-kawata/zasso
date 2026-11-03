// PX-350 @verifies C006
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeGif,
  estimateGifBytes,
  fitFramesToCeiling,
} from '../../.claude/scripts/conver/progress-gif/engine.js';

function u16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

/** Walk the GIF block structure and return every image descriptor. */
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function imageDescriptors(bytes) {
  let offset = 13;
  if (bytes[10] & 0x80) {
    const tableSize = 3 * (2 << (bytes[10] & 0x07));
    offset += tableSize;
  }
  const descriptors = [];
  while (offset < bytes.length) {
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      offset += 1;
      while (bytes[offset] !== 0) offset += bytes[offset] + 1;
      offset += 1;
      continue;
    }
    if (marker !== 0x2c) throw new Error(`unknown GIF block 0x${marker.toString(16)} at ${offset - 1}`);
    const descriptor = {
      x: u16(bytes, offset),
      y: u16(bytes, offset + 2),
      width: u16(bytes, offset + 4),
      height: u16(bytes, offset + 6),
    };
    offset += 9;
    offset += 1;
    while (bytes[offset] !== 0) offset += bytes[offset] + 1;
    offset += 1;
    descriptors.push(descriptor);
  }
  return descriptors;
}

test('the first frame is full and later frames are bounding-box deltas', () => {
  const width = 4;
  const height = 3;
  const first = new Uint8Array(width * height).fill(1);
  const second = new Uint8Array(width * height).fill(1);
  second[5] = 2;
  const gif = encodeGif({ width, height, frames: [first, second], delayCs: 10 });
  assert.equal(String.fromCharCode(...gif.slice(0, 6)), 'GIF89a');
  assert.equal(u16(gif, 6), width);
  assert.equal(u16(gif, 8), height);
  assert.equal(gif[10] & 0x80, 0x80);
  const descriptors = imageDescriptors(gif);
  assert.equal(descriptors.length, 2);
  assert.deepEqual(descriptors[0], { x: 0, y: 0, width, height });
  assert.deepEqual(descriptors[1], { x: 1, y: 1, width: 1, height: 1 });
  assert.equal(gif[gif.length - 1], 0x3b);
});

test('an unchanged frame is encoded as a one-pixel delta', () => {
  const frame = new Uint8Array(12).fill(4);
  const gif = encodeGif({ width: 4, height: 3, frames: [frame, new Uint8Array(frame)], delayCs: 10 });
  const descriptors = imageDescriptors(gif);
  assert.deepEqual(descriptors[1], { x: 0, y: 0, width: 1, height: 1 });
});

test('encodeGif is deterministic for identical frames', () => {
  const width = 2;
  const height = 2;
  const first = encodeGif({ width, height, frames: [new Uint8Array([0, 1, 2, 3])], delayCs: 10 });
  const second = encodeGif({ width, height, frames: [new Uint8Array([0, 1, 2, 3])], delayCs: 10 });
  assert.deepEqual(Buffer.from(first), Buffer.from(second));
});

test('the GIF declares an infinite Netscape loop', () => {
  const gif = encodeGif({ width: 2, height: 2, frames: [new Uint8Array([0, 1, 2, 3])], delayCs: 10 });
  const text = Buffer.from(gif).toString('latin1');
  assert.ok(text.includes('NETSCAPE2.0'));
  assert.ok(gif.includes(0x21) && gif.includes(0xff));
});

test('estimateGifBytes grows with pixels and frames', () => {
  const small = estimateGifBytes({ width: 100, height: 100 }, { frames: 10 });
  const large = estimateGifBytes({ width: 200, height: 200 }, { frames: 20 });
  assert.ok(large > small);
  assert.ok(small > 0);
});

test('fitFramesToCeiling reduces only when the estimate exceeds the ceiling', () => {
  const below = fitFramesToCeiling({ width: 100, height: 100 }, 120, 100 * 1024 * 1024);
  assert.equal(below.frames, 120);
  assert.equal(below.warnings.length, 0);
  const above = fitFramesToCeiling({ width: 4000, height: 4000 }, 120, 1024 * 1024);
  assert.ok(above.frames < 120);
  assert.ok(above.frames >= 20);
  assert.ok(above.warnings.length > 0);
});
