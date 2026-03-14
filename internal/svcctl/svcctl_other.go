//go:build !linux && !darwin && !windows

package svcctl

import (
	"fmt"
	"runtime"
)

type otherManager struct{}

func newManager() Manager {
	return &otherManager{}
}

func (m *otherManager) Install(_ string, _ []string) error {
	return fmt.Errorf("automatic service installation is not supported on %s/%s\nPlease configure the service manager manually for your system", runtime.GOOS, runtime.GOARCH)
}

func (m *otherManager) Uninstall() error {
	return fmt.Errorf("automatic service uninstallation is not supported on %s/%s", runtime.GOOS, runtime.GOARCH)
}

func (m *otherManager) Start() error {
	return fmt.Errorf("automatic service start is not supported on %s/%s", runtime.GOOS, runtime.GOARCH)
}

func (m *otherManager) Stop() error {
	return fmt.Errorf("automatic service stop is not supported on %s/%s", runtime.GOOS, runtime.GOARCH)
}

func (m *otherManager) Restart() error {
	return fmt.Errorf("automatic service restart is not supported on %s/%s", runtime.GOOS, runtime.GOARCH)
}

func (m *otherManager) Status() error {
	return fmt.Errorf("automatic service status is not supported on %s/%s", runtime.GOOS, runtime.GOARCH)
}
