package terminal

import (
	"bytes"
	"testing"
)

func TestManagerGetReplaySnapshotIncremental(t *testing.T) {
	manager := &Manager{}
	at := &activeTerminal{
		historyBuffer: newHistoryBuffer(16),
	}

	_, _ = at.historyBuffer.Write([]byte("abcdef"))
	snapshot := manager.getReplaySnapshot(at, 2)

	if snapshot.reset {
		t.Fatal("expected incremental replay")
	}
	if snapshot.cursor != 6 {
		t.Fatalf("expected cursor 6, got %d", snapshot.cursor)
	}
	if !bytes.Equal(snapshot.data, []byte("cdef")) {
		t.Fatalf("expected %q, got %q", []byte("cdef"), snapshot.data)
	}
}

func TestManagerGetReplaySnapshotFallbackToReset(t *testing.T) {
	manager := &Manager{}
	at := &activeTerminal{
		historyBuffer: newHistoryBuffer(5),
	}

	_, _ = at.historyBuffer.Write([]byte("abcdef"))
	snapshot := manager.getReplaySnapshot(at, 0)

	if !snapshot.reset {
		t.Fatal("expected reset replay on stale cursor")
	}
	if snapshot.cursor != 6 {
		t.Fatalf("expected cursor 6, got %d", snapshot.cursor)
	}
	if !bytes.Equal(snapshot.data, []byte("bcdef")) {
		t.Fatalf("expected %q, got %q", []byte("bcdef"), snapshot.data)
	}
}
