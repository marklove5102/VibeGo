//go:build !darwin

package handler

import "fmt"

func darwinSendMediaKey(keyType int) error {
	return fmt.Errorf("darwinSendMediaKey is only supported on macOS")
}
