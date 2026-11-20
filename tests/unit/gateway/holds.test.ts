// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createHoldBook } from "@/lib/gateway/holds";

const big = (n: number) => BigInt(n);
const none = { workspace: big(0), key: big(0) };

describe("createHoldBook", () => {
  it("adds holds per workspace and per key until they are released", () => {
    const book = createHoldBook({ now: () => 0 });
    const releaseA = book.hold("ws-1", "key-a", big(100));
    const releaseB = book.hold("ws-1", "key-b", big(40));
    book.hold("ws-2", "key-c", big(7));
    expect(book.held("ws-1", "key-a", book.mark())).toEqual({ workspace: big(140), key: big(100) });
    expect(book.held("ws-1", "key-b", book.mark())).toEqual({ workspace: big(140), key: big(40) });

    releaseA();
    releaseA();
    expect(book.held("ws-1", "key-a", book.mark())).toEqual({ workspace: big(40), key: big(0) });
    releaseB();
    expect(book.held("ws-1", "key-b", book.mark())).toEqual(none);
    expect(book.held("ws-2", "key-c", book.mark())).toEqual({ workspace: big(7), key: big(7) });
  });

  it("keeps counting a release for a request that read the database before it", () => {
    const book = createHoldBook({ now: () => 0 });
    const release = book.hold("ws", "key", big(100));
    // Este request leyó saldos antes de que el cobro del otro llegara a la base.
    const staleRead = book.mark();
    release();
    expect(book.held("ws", "key", staleRead)).toEqual({ workspace: big(100), key: big(100) });
    expect(book.held("ws", "key", book.mark())).toEqual(none);
  });

  it("forgets releases after a minute, including those of idle workspaces", () => {
    let time = 0;
    const book = createHoldBook({ now: () => time });
    const before = book.mark();
    book.hold("ws-idle", "key-idle", big(5))();
    book.hold("ws", "key", big(9))();
    time = 30_000;
    expect(book.held("ws-idle", "key-idle", before)).toEqual({ workspace: big(5), key: big(5) });
    time = 61_000;
    expect(book.held("ws", "key", before)).toEqual(none);
    expect(book.held("ws-idle", "key-idle", before)).toEqual(none);
  });

  it("rejects negative holds", () => {
    expect(() => createHoldBook().hold("ws", "key", big(-1))).toThrow(RangeError);
  });
});
