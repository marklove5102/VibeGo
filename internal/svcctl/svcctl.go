package svcctl

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"

	"github.com/xxnuo/vibego/internal/version"
)

const ServiceName = "vibego"
const ServiceDescription = "VibeGo - Vibe Anywhere"

type Manager interface {
	Install(binPath string, args []string) error
	Uninstall() error
	Start() error
	Stop() error
	Restart() error
	Status() error
}

func Run(args []string) bool {
	if len(args) < 2 {
		return false
	}

	switch args[1] {
	case "install":
		handleInstall()
		return true
	case "uninstall":
		handleUninstall()
		return true
	case "service":
		handleService(args)
		return true
	default:
		return false
	}
}

func handleInstall() {
	src := currentBinPath()
	dst := InstalledBinPath()

	if src == dst {
		fmt.Println("Already installed at", dst)
		return
	}

	dir := filepath.Dir(dst)
	if err := os.MkdirAll(dir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Error: create directory %s: %v\n", dir, err)
		os.Exit(1)
	}

	if err := copyFile(src, dst); err != nil {
		fmt.Fprintf(os.Stderr, "Error: copy binary: %v\n", err)
		os.Exit(1)
	}
	if err := os.Chmod(dst, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Error: chmod: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Installed to %s\n", dst)
	fmt.Printf("Make sure %s is in your PATH\n", dir)
}

func handleUninstall() {
	dst := InstalledBinPath()
	if err := os.Remove(dst); err != nil {
		if os.IsNotExist(err) {
			fmt.Println("Not installed")
			return
		}
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Removed %s\n", dst)
}

func handleService(args []string) {
	if len(args) < 3 {
		printUsage()
		os.Exit(1)
	}

	mgr := newManager()
	var err error

	switch args[2] {
	case "install":
		ensureInstalled()
		extraArgs := collectExtraArgs(args)
		err = mgr.Install(InstalledBinPath(), extraArgs)
	case "uninstall":
		err = mgr.Uninstall()
	case "start":
		err = mgr.Start()
	case "stop":
		err = mgr.Stop()
	case "restart":
		err = mgr.Restart()
	case "status":
		err = mgr.Status()
	default:
		fmt.Fprintf(os.Stderr, "Unknown service command: %s\n\n", args[2])
		printUsage()
		os.Exit(1)
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func ensureInstalled() {
	src := currentBinPath()
	dst := InstalledBinPath()

	if src == dst {
		return
	}

	dir := filepath.Dir(dst)
	_ = os.MkdirAll(dir, 0755)

	if err := copyFile(src, dst); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: failed to update installed binary: %v\n", err)
		return
	}
	_ = os.Chmod(dst, 0755)
	fmt.Printf("Updated %s\n", dst)
}

func InstalledBinPath() string {
	home, _ := os.UserHomeDir()
	name := ServiceName
	if runtime.GOOS == "windows" {
		name += ".exe"
		localAppData := os.Getenv("LOCALAPPDATA")
		if localAppData != "" {
			return filepath.Join(localAppData, "Programs", ServiceName, name)
		}
		return filepath.Join(home, "AppData", "Local", "Programs", ServiceName, name)
	}
	return filepath.Join(home, ".local", "bin", name)
}

func currentBinPath() string {
	p, err := os.Executable()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to get executable path: %v\n", err)
		os.Exit(1)
	}
	p, err = filepath.EvalSymlinks(p)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to resolve executable path: %v\n", err)
		os.Exit(1)
	}
	return p
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	tmp := dst + ".tmp"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}

	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		os.Remove(tmp)
		return err
	}

	return os.Rename(tmp, dst)
}

func collectExtraArgs(args []string) []string {
	if len(args) <= 3 {
		return nil
	}
	return args[3:]
}

func printUsage() {
	fmt.Fprintf(os.Stderr, "VibeGo %s\n\n", version.Version)
	fmt.Fprintf(os.Stderr, "Usage:\n")
	fmt.Fprintf(os.Stderr, "  %s install                          Install binary to ~/.local/bin\n", os.Args[0])
	fmt.Fprintf(os.Stderr, "  %s uninstall                        Remove installed binary\n", os.Args[0])
	fmt.Fprintf(os.Stderr, "  %s service <command> [service flags] Manage system service\n\n", os.Args[0])
	fmt.Fprintf(os.Stderr, "Service commands:\n")
	fmt.Fprintf(os.Stderr, "  install     Install as system service (auto-copies binary)\n")
	fmt.Fprintf(os.Stderr, "  uninstall   Uninstall system service\n")
	fmt.Fprintf(os.Stderr, "  start       Start the service\n")
	fmt.Fprintf(os.Stderr, "  stop        Stop the service\n")
	fmt.Fprintf(os.Stderr, "  restart     Restart the service\n")
	fmt.Fprintf(os.Stderr, "  status      Show service status\n")
	fmt.Fprintf(os.Stderr, "\nExample:\n")
	fmt.Fprintf(os.Stderr, "  %s service install -port 8080 -no-tls\n", os.Args[0])
}
