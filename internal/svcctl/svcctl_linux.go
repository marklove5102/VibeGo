//go:build linux

package svcctl

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

const unitPath = "/etc/systemd/system/vibego.service"

type linuxManager struct{}

func newManager() Manager {
	return &linuxManager{}
}

func (m *linuxManager) Install(binPath string, args []string) error {
	if os.Getuid() != 0 {
		return fmt.Errorf("need root privileges, try: sudo %s", strings.Join(os.Args, " "))
	}

	execStart := binPath
	if len(args) > 0 {
		execStart += " " + strings.Join(args, " ")
	}

	unit := fmt.Sprintf(`[Unit]
Description=%s
After=network.target

[Service]
Type=simple
ExecStart=%s
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
`, ServiceDescription, execStart)

	if err := os.WriteFile(unitPath, []byte(unit), 0644); err != nil {
		return fmt.Errorf("write unit file: %w", err)
	}

	if err := run("systemctl", "daemon-reload"); err != nil {
		return fmt.Errorf("daemon-reload: %w", err)
	}
	if err := run("systemctl", "enable", ServiceName); err != nil {
		return fmt.Errorf("enable service: %w", err)
	}

	fmt.Printf("Service installed: %s\n", unitPath)
	fmt.Printf("Run: sudo %s service start\n", os.Args[0])
	return nil
}

func (m *linuxManager) Uninstall() error {
	if os.Getuid() != 0 {
		return fmt.Errorf("need root privileges, try: sudo %s", strings.Join(os.Args, " "))
	}

	_ = run("systemctl", "stop", ServiceName)
	_ = run("systemctl", "disable", ServiceName)

	if err := os.Remove(unitPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove unit file: %w", err)
	}

	if err := run("systemctl", "daemon-reload"); err != nil {
		return fmt.Errorf("daemon-reload: %w", err)
	}

	fmt.Println("Service uninstalled")
	return nil
}

func (m *linuxManager) Start() error {
	if os.Getuid() != 0 {
		return fmt.Errorf("need root privileges, try: sudo %s", strings.Join(os.Args, " "))
	}
	if err := run("systemctl", "start", ServiceName); err != nil {
		return err
	}
	fmt.Println("Service started")
	return nil
}

func (m *linuxManager) Stop() error {
	if os.Getuid() != 0 {
		return fmt.Errorf("need root privileges, try: sudo %s", strings.Join(os.Args, " "))
	}
	if err := run("systemctl", "stop", ServiceName); err != nil {
		return err
	}
	fmt.Println("Service stopped")
	return nil
}

func (m *linuxManager) Restart() error {
	if os.Getuid() != 0 {
		return fmt.Errorf("need root privileges, try: sudo %s", strings.Join(os.Args, " "))
	}
	if err := run("systemctl", "restart", ServiceName); err != nil {
		return err
	}
	fmt.Println("Service restarted")
	return nil
}

func (m *linuxManager) Status() error {
	cmd := exec.Command("systemctl", "status", ServiceName)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	_ = cmd.Run()
	return nil
}

func run(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
