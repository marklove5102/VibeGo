package model

type UserSetting struct {
	UserID    string `gorm:"column:user_id;primaryKey;constraint:OnDelete:CASCADE"`
	Key       string `gorm:"column:key;primaryKey"`
	Value     string `gorm:"column:value;type:text"`
	UpdatedAt int64  `gorm:"column:updated_at;autoUpdateTime"`
}

func (UserSetting) TableName() string {
	return "user_settings"
}
