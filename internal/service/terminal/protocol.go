package terminal

const (
	MsgTypeCmd        = "cmd"
	MsgTypeResize     = "resize"
	MsgTypeHeartbeat  = "heartbeat"
	MsgTypePtyExited  = "pty_exited"
	MsgTypeReplayDone = "replay_done"
)

type WSMessage struct {
	Type      string `json:"type"`
	Data      string `json:"data,omitempty"`
	Cols      int    `json:"cols,omitempty"`
	Rows      int    `json:"rows,omitempty"`
	Timestamp int64  `json:"timestamp,omitempty"`
	Cursor    uint64 `json:"cursor,omitempty"`
	Reset     bool   `json:"reset,omitempty"`
}

type ResizeMessage struct {
	Cols int `json:"cols"`
	Rows int `json:"rows"`
}
