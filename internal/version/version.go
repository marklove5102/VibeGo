package version

import "runtime/debug"

var Version = ""

func init() {
	if Version != "" {
		return
	}
	if info, ok := debug.ReadBuildInfo(); ok && info.Main.Version != "" && info.Main.Version != "(devel)" {
		Version = info.Main.Version
		return
	}
	Version = "v0.0.0-dev"
}
