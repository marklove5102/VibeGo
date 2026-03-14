//go:build windows

package svcctl

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

type windowsManager struct{}

func newManager() Manager {
	return &windowsManager{}
}

func (m *windowsManager) Install(binPath string, args []string) error {
	binPath = `"` + binPath + `"`
	if len(args) > 0 {
		binPath += " " + strings.Join(args, " ")
	}

	if err := runSC("create", ServiceName,
		fmt.Sprintf("binPath= %s", binPath),
		"start= auto",
		fmt.Sprintf("DisplayName= %s", ServiceDescription),
	); err != nil {
		return fmt.Errorf("sc create: %w", err)
	}

	_ = runSC("description", ServiceName, ServiceDescription)

	fmt.Println("Service installed")
	fmt.Printf("Run: %s service start\n", os.Args[0])
	return nil
}

func (m *windowsManager) Uninstall() error {
	_ = runSC("stop", ServiceName)
	if err := runSC("delete", ServiceName); err != nil {
		return fmt.Errorf("sc delete: %w", err)
	}
	fmt.Println("Service uninstalled")
	return nil
}

func (m *windowsManager) Start() error {
	if err := runSC("start", ServiceName); err != nil {
		return err
	}
	fmt.Println("Service started")
	return nil
}

func (m *windowsManager) Stop() error {
	if err := runSC("stop", ServiceName); err != nil {
		return err
	}
	fmt.Println("Service stopped")
	return nil
}

func (m *windowsManager) Restart() error {
	_ = runSC("stop", ServiceName)
	if err := runSC("start", ServiceName); err != nil {
		return err
	}
	fmt.Println("Service restarted")
	return nil
}

func (m *windowsManager) Status() error {
	cmd := exec.Command("sc", "query", ServiceName)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Println("Service is not installed or not accessible")
	}
	return nil
}

func runSC(args ...string) error {
	cmd := exec.Command("sc", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
