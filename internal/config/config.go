package config

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/xxnuo/vibego/internal/utils"
	"github.com/xxnuo/vibego/internal/version"
)

type Config struct {
	LogLevel  string
	HomeDir   string
	ConfigDir string
	LogDir    string

	Host        string
	Port        string
	CORSOrigins string

	Key string

	AllowWAN         bool
	NeedKey          bool
	DisableLogToFile bool
	NoTLS            bool

	TlsCert    string
	TlsKey     string
	DevUI      string
	AsrVersion string
	AsrWasmURL string
	AsrDataURL string

	OS           string
	DefaultShell string
}

var GlobalConfig *Config = nil

func GetConfig() *Config {
	if GlobalConfig != nil {
		return GlobalConfig
	}

	cfg := &Config{}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}

	cfg.HomeDir = filepath.Join(homeDir, ".config", "vibego")
	cfg.ConfigDir = filepath.Join(cfg.HomeDir, "server")
	cfg.LogDir = filepath.Join(cfg.HomeDir, "logs")

	flag.StringVar(&cfg.LogLevel, "log-level", utils.GetEnv("VG_LOG_LEVEL", "warn"), "Log level (debug, info, warn, error)")
	flag.StringVar(&cfg.ConfigDir, "config-dir", utils.GetEnv("VG_CONFIG_DIR", cfg.ConfigDir), "Config directory")
	flag.StringVar(&cfg.LogDir, "log-dir", utils.GetEnv("VG_LOG_DIR", cfg.LogDir), "Log directory")
	flag.StringVar(&cfg.Host, "host", utils.GetEnv("VG_HOST", "0.0.0.0"), "Server host address")
	flag.StringVar(&cfg.Port, "port", utils.GetEnv("VG_PORT", "1984"), "Server port")
	flag.StringVar(&cfg.Port, "p", utils.GetEnv("VG_PORT", "1984"), "Server port(shorthand)")
	flag.StringVar(&cfg.Key, "key", utils.GetEnv("VG_KEY", ""), "Access key, if key is empty, allow-wan will be disabled for security reasons")
	flag.StringVar(&cfg.Key, "k", utils.GetEnv("VG_KEY", ""), "Access key(shorthand)")
	flag.BoolVar(&cfg.AllowWAN, "allow-wan", utils.GetBoolEnv("VG_ALLOW_WAN", true), "Allow WAN access, if allow-wan is false, the service will only be accessible from the LAN")
	flag.BoolVar(&cfg.AllowWAN, "a", utils.GetBoolEnv("VG_ALLOW_WAN", true), "Allow WAN access(shorthand)")
	flag.StringVar(&cfg.CORSOrigins, "cors-origins", utils.GetEnv("VG_CORS_ORIGINS", "*"), "CORS origins")
	flag.BoolVar(&cfg.DisableLogToFile, "disable-log-to-file", utils.GetBoolEnv("VG_DISABLE_LOG_TO_FILE", false), "Disable log to file")
	flag.BoolVar(&cfg.NeedKey, "need-key", utils.GetBoolEnv("VG_NEED_KEY", false), "Require key authentication (auto-enabled when allow-wan and key are both set)")
	flag.StringVar(&cfg.TlsCert, "tls-cert", utils.GetEnv("VG_TLS_CERT", ""), "TLS certificate file path (uses self-signed if empty)")
	flag.StringVar(&cfg.TlsKey, "tls-key", utils.GetEnv("VG_TLS_KEY", ""), "TLS private key file path (uses self-signed if empty)")
	flag.BoolVar(&cfg.NoTLS, "no-tls", utils.GetBoolEnv("VG_NO_TLS", false), "Disable TLS and use plain HTTP")
	flag.StringVar(&cfg.DevUI, "dev-ui", utils.GetEnv("VG_DEV_UI", ""), "Dev UI proxy target (e.g. http://localhost:5173)")
	flag.StringVar(&cfg.AsrVersion, "asr-version", utils.GetEnv("VG_ASR_VERSION", ""), "ASR asset version for cache busting")
	flag.StringVar(&cfg.AsrWasmURL, "asr-wasm-url", utils.GetEnv("VG_ASR_WASM_URL", ""), "ASR wasm asset URL")
	flag.StringVar(&cfg.AsrDataURL, "asr-data-url", utils.GetEnv("VG_ASR_DATA_URL", ""), "ASR data asset URL")

	defaultShell := ""
	switch runtime.GOOS {
	case "linux":
		defaultShell = utils.GetEnv("SHELL", "/bin/bash")
	case "darwin":
		defaultShell = utils.GetEnv("SHELL", "/bin/zsh")
	case "windows":
		defaultShell = utils.GetEnv("SHELL", "powershell")
	default:
		defaultShell = utils.GetEnv("SHELL", "/bin/sh")
	}

	flag.StringVar(&cfg.DefaultShell, "shell", utils.GetEnv("VG_SHELL", defaultShell), "Default shell for terminal sessions")

	versionFlag := flag.Bool("version", false, "Show version information")
	versionShortFlag := flag.Bool("v", false, "Show version information (shorthand)")
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "VibeGo %s - Vibe Anywhere\n\n", version.Version)
		fmt.Fprintf(os.Stderr, "Usage:\n")
		fmt.Fprintf(os.Stderr, "  %s [options]\n\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "Options:\n")
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, "\nAll options also accept environment variables prefixed with VG_, e.g. VG_LOG_LEVEL=debug.\n")
	}
	flag.Parse()

	if *versionFlag || *versionShortFlag {
		fmt.Printf("%s\n", version.Version)
		os.Exit(0)
	}

	// Post process
	if cfg.Key == "" {
		cfg.AllowWAN = false
	}
	if cfg.AllowWAN && cfg.Key != "" {
		cfg.NeedKey = true
	}

	GlobalConfig = cfg
	return cfg
}
