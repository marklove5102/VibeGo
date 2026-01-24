package model

type TerminalHistory struct {
	ID        int64  `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	SessionID string `gorm:"column:session_id;uniqueIndex:idx_session_seq;index:idx_session_created;constraint:OnDelete:CASCADE" json:"session_id"`
	Sequence  int64  `gorm:"column:sequence;uniqueIndex:idx_session_seq" json:"sequence"`
	Data      []byte `gorm:"column:data" json:"data"`
	CreatedAt int64  `gorm:"column:created_at;index:idx_session_created" json:"created_at"`
}

func (TerminalHistory) TableName() string {
	return "terminal_history"
}
