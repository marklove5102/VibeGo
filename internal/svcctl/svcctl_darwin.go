//go:build darwin

package svcctl

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

const (
	daemonLabel   = "com.vibego.server"
	daemonPlistFn = daemonLabel + ".plist"
)

type darwinManager struct{}

func newManager() Manager {
	return &darwinManager{}
}

func (m *darwinManager) plistPath() string {
	if os.Getuid() == 0 {
		return filepath.Join("/Library/LaunchDaemons", daemonPlistFn)
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "LaunchAgents", daemonPlistFn)
}

func (m *darwinManager) Install(binPath string, args []string) error {
	programArgs := "    <string>" + binPath + "</string>\n"
	for _, a := range args {
		programArgs += "    <string>" + a + "</string>\n"
	}

	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>%s</string>
  <key>ProgramArguments</key>
  <array>
%s  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/vibego.out.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/vibego.err.log</string>
</dict>
</plist>
`, daemonLabel, programArgs)

	p := m.plistPath()
	dir := filepath.Dir(p)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create directory: %w", err)
	}

	if err := os.WriteFile(p, []byte(plist), 0644); err != nil {
		return fmt.Errorf("write plist: %w", err)
	}

	fmt.Printf("Service installed: %s\n", p)
	fmt.Printf("Run: %s service start\n", os.Args[0])
	return nil
}

func (m *darwinManager) Uninstall() error {
	p := m.plistPath()
	_ = runCmd("launchctl", "unload", p)

	if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove plist: %w", err)
	}

	fmt.Println("Service uninstalled")
	return nil
}

func (m *darwinManager) Start() error {
	p := m.plistPath()
	if _, err := os.Stat(p); os.IsNotExist(err) {
		return fmt.Errorf("service not installed, run: %s service install", os.Args[0])
	}
	if err := runCmd("launchctl", "load", p); err != nil {
		return err
	}
	fmt.Println("Service started")
	return nil
}

func (m *darwinManager) Stop() error {
	if err := runCmd("launchctl", "unload", m.plistPath()); err != nil {
		return err
	}
	fmt.Println("Service stopped")
	return nil
}

func (m *darwinManager) Restart() error {
	p := m.plistPath()
	_ = runCmd("launchctl", "unload", p)
	if err := runCmd("launchctl", "load", p); err != nil {
		return err
	}
	fmt.Println("Service restarted")
	return nil
}

func (m *darwinManager) Status() error {
	cmd := exec.Command("launchctl", "list", daemonLabel)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Println("Service is not running")
	}
	return nil
}

func runCmd(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
