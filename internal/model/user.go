package model

type User struct {
	ID          string `gorm:"column:id;primaryKey" json:"id"`
	Username    string `gorm:"column:username;uniqueIndex" json:"username"`
	TokenHash   string `gorm:"column:token_hash" json:"-"`
	Status      string `gorm:"column:status;default:active" json:"status"`
	CreatedAt   int64  `gorm:"column:created_at" json:"created_at"`
	LastLoginAt int64  `gorm:"column:last_login_at" json:"last_login_at"`
	DeletedAt   *int64 `gorm:"column:deleted_at;index" json:"deleted_at,omitempty"`
}

func (User) TableName() string {
	return "users"
}
