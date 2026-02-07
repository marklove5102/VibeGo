//go:build windows

package handler

import "io/fs"

func fillFileOwnership(fi *FileInfo, info fs.FileInfo) {}
