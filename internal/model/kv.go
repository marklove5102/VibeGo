package model

type KV struct {
	UserID string `gorm:"column:user_id;primaryKey;constraint:OnDelete:CASCADE" json:"user_id"`
	Key    string `gorm:"column:key;primaryKey" json:"key"`
	Value  string `gorm:"column:value;type:text" json:"value"`
}

func (KV) TableName() string {
	return "kvs"
}
