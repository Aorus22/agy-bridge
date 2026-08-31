//go:build !windows

package main

import "syscall"

// stopProcess sends SIGTERM to the agy process on Unix systems.
func stopProcess(pid int) error {
	return syscall.Kill(pid, syscall.SIGTERM)
}
