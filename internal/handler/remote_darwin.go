//go:build darwin

package handler

import (
	"fmt"
	"os/exec"
)

func darwinSendMediaKey(keyType int) error {
	script := fmt.Sprintf(`ObjC.import("Cocoa");
var k=%d;
var d=$.NSEvent.otherEventWithTypeLocationModifierFlagsTimestampWindowNumberContextSubtypeData1Data2(14,{x:0,y:0},0xa00,0,0,0,8,(k<<16)|(0x0a<<8),-1);
$.CGEventPost(0,d.CGEvent);
var u=$.NSEvent.otherEventWithTypeLocationModifierFlagsTimestampWindowNumberContextSubtypeData1Data2(14,{x:0,y:0},0xb00,0,0,0,8,(k<<16)|(0x0b<<8),-1);
$.CGEventPost(0,u.CGEvent);`, keyType)
	out, err := exec.Command("osascript", "-l", "JavaScript", "-e", script).CombinedOutput()
	if err != nil {
		return fmt.Errorf("run osascript media key: %s: %w", string(out), err)
	}
	return nil
}
