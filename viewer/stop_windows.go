//go:build windows

package main

import "os"

// stopProcess terminates the agy process on Windows, where SIGTERM is not
// supported. os.Process.Kill issues a TerminateProcess call.
func stopProcess(pid int) error {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	return proc.Kill()
}
