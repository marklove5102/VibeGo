//go:build !windows

package handler

import (
	"io/fs"
	"os/user"
	"strconv"
	"syscall"
)

func fillFileOwnership(fi *FileInfo, info fs.FileInfo) {
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return
	}
	fi.Uid = strconv.FormatUint(uint64(stat.Uid), 10)
	fi.Gid = strconv.FormatUint(uint64(stat.Gid), 10)
	if u, err := user.LookupId(fi.Uid); err == nil {
		fi.User = u.Username
	} else {
		fi.User = fi.Uid
	}
	if g, err := user.LookupGroupId(fi.Gid); err == nil {
		fi.Group = g.Name
	} else {
		fi.Group = fi.Gid
	}
}
