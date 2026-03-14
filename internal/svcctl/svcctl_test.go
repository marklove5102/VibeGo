package svcctl

import (
	"bytes"
	"errors"
	"runtime"
	"strings"
	"testing"

	kservice "github.com/kardianos/service"
)

func TestRunHelp(t *testing.T) {
	stderr := osStderr
	defer func() {
		osStderr = stderr
	}()

	var buf bytes.Buffer
	osStderr = &buf

	if !Run([]string{"vibego", "help"}, nil) {
		t.Fatalf("expected help command to be handled")
	}

	output := buf.String()
	if !strings.Contains(output, "Usage:") {
		t.Fatalf("expected usage output, got %q", output)
	}
	if !strings.Contains(output, "service <command> [service flags]") {
		t.Fatalf("expected service usage in output, got %q", output)
	}
}

func TestRunServiceHelp(t *testing.T) {
	stderr := osStderr
	defer func() {
		osStderr = stderr
	}()

	var buf bytes.Buffer
	osStderr = &buf

	if !Run([]string{"vibego", "service", "help"}, nil) {
		t.Fatalf("expected service help command to be handled")
	}

	output := buf.String()
	if !strings.Contains(output, "Service commands:") {
		t.Fatalf("expected service commands output, got %q", output)
	}
	if !strings.Contains(output, "--user      Install/control current user service") {
		t.Fatalf("expected service scope entry, got %q", output)
	}
}

func TestParseServiceFlags(t *testing.T) {
	scope, rest, err := parseServiceFlags([]string{"--user", "-port", "8080"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if scope != scopeUser {
		t.Fatalf("expected user scope, got %v", scope)
	}
	if strings.Join(rest, " ") != "-port 8080" {
		t.Fatalf("unexpected rest args: %#v", rest)
	}

	scope, rest, err = parseServiceFlags([]string{"--system", "-no-tls"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if scope != scopeSystem {
		t.Fatalf("expected system scope, got %v", scope)
	}
	if strings.Join(rest, " ") != "-no-tls" {
		t.Fatalf("unexpected rest args: %#v", rest)
	}
}

func TestParseServiceFlagsRejectsMixedScope(t *testing.T) {
	_, _, err := parseServiceFlags([]string{"--user", "--system"})
	if err == nil {
		t.Fatalf("expected mixed scope error")
	}
}

func TestResolveUserService(t *testing.T) {
	tests := []struct {
		name      string
		goos      string
		uid       int
		scope     serviceScope
		want      bool
		wantError bool
	}{
		{name: "linux root auto system", goos: "linux", uid: 0, scope: scopeAuto},
		{name: "linux user auto user", goos: "linux", uid: 1000, scope: scopeAuto, want: true},
		{name: "darwin explicit user", goos: "darwin", uid: 0, scope: scopeUser, want: true},
		{name: "windows auto system", goos: "windows", uid: 1000, scope: scopeAuto},
		{name: "windows explicit user error", goos: "windows", uid: 1000, scope: scopeUser, wantError: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := resolveUserService(tt.goos, tt.uid, tt.scope)
			if tt.wantError {
				if err == nil {
					t.Fatalf("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("expected %v, got %v", tt.want, got)
			}
		})
	}
}

func TestBinPaths(t *testing.T) {
	if got := userBinPath("linux", "/home/me", ""); got != "/home/me/.local/bin/vibego" {
		t.Fatalf("unexpected linux user path: %s", got)
	}
	if got := systemBinPath("linux", ""); got != "/usr/local/bin/vibego" {
		t.Fatalf("unexpected linux system path: %s", got)
	}
	if got := userBinPath("windows", `C:\Users\me`, `C:\Users\me\AppData\Local`); !strings.Contains(got, `AppData\Local`) || !strings.HasSuffix(got, "vibego.exe") {
		t.Fatalf("unexpected windows user path: %s", got)
	}
	if got := systemBinPath("windows", `C:\Program Files`); !strings.Contains(got, `Program Files`) || !strings.HasSuffix(got, "vibego.exe") {
		t.Fatalf("unexpected windows system path: %s", got)
	}
}

func TestServiceConfig(t *testing.T) {
	cfg := newServiceConfig(true, "/tmp/vibego", []string{"service", "run", "-port", "8080"})
	if cfg.Executable != "/tmp/vibego" {
		t.Fatalf("unexpected executable: %s", cfg.Executable)
	}
	if strings.Join(cfg.Arguments, " ") != "service run -port 8080" {
		t.Fatalf("unexpected arguments: %#v", cfg.Arguments)
	}
	if cfg.Option["UserService"] != true {
		t.Fatalf("expected user service option")
	}

	if runtime.GOOS == "linux" {
		script, ok := cfg.Option["SystemdScript"].(string)
		if !ok {
			t.Fatalf("expected systemd script")
		}
		if !strings.Contains(script, "WantedBy=default.target") {
			t.Fatalf("expected user target in script: %s", script)
		}
		if !strings.Contains(script, "LimitNOFILE=65536") {
			t.Fatalf("expected nofile limit in script: %s", script)
		}
	}
}

func TestPrintServiceStatus(t *testing.T) {
	tests := []struct {
		name      string
		status    kservice.Status
		err       error
		wantOut   string
		wantError bool
	}{
		{name: "running", status: kservice.StatusRunning, wantOut: "running\n"},
		{name: "stopped", status: kservice.StatusStopped, wantOut: "stopped\n"},
		{name: "not installed", err: kservice.ErrNotInstalled, wantOut: "not-installed\n", wantError: true},
		{name: "unknown error", err: errors.New("boom"), wantOut: "not-installed\n", wantError: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stdout := osStdout
			defer func() {
				osStdout = stdout
			}()

			var buf bytes.Buffer
			osStdout = &buf

			err := printServiceStatus(fakeService{status: tt.status, err: tt.err})
			if tt.wantError && err == nil {
				t.Fatalf("expected error")
			}
			if !tt.wantError && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if buf.String() != tt.wantOut {
				t.Fatalf("expected %q, got %q", tt.wantOut, buf.String())
			}
		})
	}
}

type fakeService struct {
	kservice.Service
	status kservice.Status
	err    error
}

func (s fakeService) Status() (kservice.Status, error) {
	return s.status, s.err
}
