package handler

import (
	"fmt"
	"net/http"
	"os/exec"
	"runtime"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func darwinMediaKey(keyType int) {
	script := fmt.Sprintf(`ObjC.import("Cocoa");
var k=%d;
var down=$.NSEvent.otherEventWithTypeLocationModifierFlagsTimestampWindowNumberContextSubtypeData1Data2(14,{x:0,y:0},0xa00,0,0,0,8,(k<<16)|(0x0a<<8),-1);
$.CGEventPost(0,down.CGEvent);
var up=$.NSEvent.otherEventWithTypeLocationModifierFlagsTimestampWindowNumberContextSubtypeData1Data2(14,{x:0,y:0},0xb00,0,0,0,8,(k<<16)|(0x0b<<8),-1);
$.CGEventPost(0,up.CGEvent);`, keyType)
	runCmd("osascript", "-l", "JavaScript", "-e", script)
}

type RemoteHandler struct{}

func NewRemoteHandler() *RemoteHandler {
	return &RemoteHandler{}
}

func (h *RemoteHandler) Register(g *gin.RouterGroup) {
	r := g.Group("/remote")
	r.POST("/volume", h.SetVolume)
	r.POST("/volume/up", h.VolumeUp)
	r.POST("/volume/down", h.VolumeDown)
	r.POST("/volume/mute", h.VolumeMute)
	r.GET("/volume", h.GetVolume)
	r.POST("/media/play-pause", h.MediaPlayPause)
	r.POST("/media/next", h.MediaNext)
	r.POST("/media/previous", h.MediaPrevious)
	r.POST("/brightness", h.SetBrightness)
	r.POST("/brightness/up", h.BrightnessUp)
	r.POST("/brightness/down", h.BrightnessDown)
	r.GET("/brightness", h.GetBrightness)
	r.POST("/screen/off", h.ScreenOff)
	r.POST("/screen/on", h.ScreenOn)
}

type volumeRequest struct {
	Level int `json:"level"`
}

type brightnessRequest struct {
	Level int `json:"level"`
}

func runCmd(name string, args ...string) (string, error) {
	out, err := exec.Command(name, args...).CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

func (h *RemoteHandler) GetVolume(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		out, err := runCmd("osascript", "-e", "output volume of (get volume settings)")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		level, _ := strconv.Atoi(out)
		mutedOut, _ := runCmd("osascript", "-e", "output muted of (get volume settings)")
		muted := mutedOut == "true"
		c.JSON(http.StatusOK, gin.H{"level": level, "muted": muted})
	case "linux":
		out, err := runCmd("amixer", "get", "Master")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		level := parseAmixerVolume(out)
		muted := strings.Contains(out, "[off]")
		c.JSON(http.StatusOK, gin.H{"level": level, "muted": muted})
	case "windows":
		out, err := runCmd("powershell", "-Command",
			"Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class Audio { [DllImport(\"user32.dll\")] public static extern int SendMessage(int hWnd, int Msg, int wParam, int lParam); }'; $wshell = New-Object -ComObject WScript.Shell; (New-Object -ComObject MMDeviceEnumerator.MMDeviceEnumerator).GetDefaultAudioEndpoint(0,1).AudioEndpointVolume.MasterVolumeLevelScalar * 100")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		level, _ := strconv.ParseFloat(strings.TrimSpace(out), 64)
		c.JSON(http.StatusOK, gin.H{"level": int(level), "muted": false})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported OS"})
	}
}

func (h *RemoteHandler) SetVolume(c *gin.Context) {
	var req volumeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Level < 0 {
		req.Level = 0
	}
	if req.Level > 100 {
		req.Level = 100
	}
	switch runtime.GOOS {
	case "darwin":
		_, err := runCmd("osascript", "-e", "set volume output volume "+strconv.Itoa(req.Level))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	case "linux":
		_, err := runCmd("amixer", "set", "Master", strconv.Itoa(req.Level)+"%")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	case "windows":
		script := "$vol = (New-Object -ComObject MMDeviceEnumerator.MMDeviceEnumerator).GetDefaultAudioEndpoint(0,1).AudioEndpointVolume; $vol.MasterVolumeLevelScalar = " + strconv.FormatFloat(float64(req.Level)/100.0, 'f', 2, 64)
		_, err := runCmd("powershell", "-Command", script)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported OS"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "level": req.Level})
}

func (h *RemoteHandler) VolumeUp(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		runCmd("osascript", "-e", "set volume output volume ((output volume of (get volume settings)) + 5)")
	case "linux":
		runCmd("amixer", "set", "Master", "5%+")
	case "windows":
		runCmd("powershell", "-Command", "$vol = (New-Object -ComObject MMDeviceEnumerator.MMDeviceEnumerator).GetDefaultAudioEndpoint(0,1).AudioEndpointVolume; $vol.MasterVolumeLevelScalar = [Math]::Min(1, $vol.MasterVolumeLevelScalar + 0.05)")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *RemoteHandler) VolumeDown(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		runCmd("osascript", "-e", "set volume output volume ((output volume of (get volume settings)) - 5)")
	case "linux":
		runCmd("amixer", "set", "Master", "5%-")
	case "windows":
		runCmd("powershell", "-Command", "$vol = (New-Object -ComObject MMDeviceEnumerator.MMDeviceEnumerator).GetDefaultAudioEndpoint(0,1).AudioEndpointVolume; $vol.MasterVolumeLevelScalar = [Math]::Max(0, $vol.MasterVolumeLevelScalar - 0.05)")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *RemoteHandler) VolumeMute(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		out, _ := runCmd("osascript", "-e", "output muted of (get volume settings)")
		if out == "true" {
			runCmd("osascript", "-e", "set volume without output muted")
		} else {
			runCmd("osascript", "-e", "set volume with output muted")
		}
	case "linux":
		runCmd("amixer", "set", "Master", "toggle")
	case "windows":
		runCmd("powershell", "-Command", "$vol = (New-Object -ComObject MMDeviceEnumerator.MMDeviceEnumerator).GetDefaultAudioEndpoint(0,1).AudioEndpointVolume; $vol.Mute = !$vol.Mute")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *RemoteHandler) MediaPlayPause(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		darwinMediaKey(16)
	case "linux":
		runCmd("playerctl", "play-pause")
	case "windows":
		runCmd("powershell", "-Command", "$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys([char]0xB3)")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *RemoteHandler) MediaNext(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		darwinMediaKey(17)
	case "linux":
		runCmd("playerctl", "next")
	case "windows":
		runCmd("powershell", "-Command", "$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys([char]0xB0)")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *RemoteHandler) MediaPrevious(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		darwinMediaKey(18)
	case "linux":
		runCmd("playerctl", "previous")
	case "windows":
		runCmd("powershell", "-Command", "$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys([char]0xB1)")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *RemoteHandler) GetBrightness(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		out, err := runCmd("brightness", "-l")
		if err != nil {
			out2, err2 := runCmd("osascript", "-e", "tell application \"System Preferences\" to quit")
			_ = out2
			if err2 != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "brightness tool not found, install via: brew install brightness"})
				return
			}
		}
		level := parseBrightness(out)
		c.JSON(http.StatusOK, gin.H{"level": level})
	case "linux":
		out, err := runCmd("brightnessctl", "g")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		current, _ := strconv.Atoi(out)
		maxOut, _ := runCmd("brightnessctl", "m")
		max, _ := strconv.Atoi(maxOut)
		level := 0
		if max > 0 {
			level = current * 100 / max
		}
		c.JSON(http.StatusOK, gin.H{"level": level})
	case "windows":
		out, err := runCmd("powershell", "-Command", "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness).CurrentBrightness")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		level, _ := strconv.Atoi(strings.TrimSpace(out))
		c.JSON(http.StatusOK, gin.H{"level": level})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported OS"})
	}
}

func (h *RemoteHandler) SetBrightness(c *gin.Context) {
	var req brightnessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Level < 0 {
		req.Level = 0
	}
	if req.Level > 100 {
		req.Level = 100
	}
	switch runtime.GOOS {
	case "darwin":
		val := strconv.FormatFloat(float64(req.Level)/100.0, 'f', 2, 64)
		_, err := runCmd("brightness", val)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "brightness tool not found, install via: brew install brightness"})
			return
		}
	case "linux":
		_, err := runCmd("brightnessctl", "set", strconv.Itoa(req.Level)+"%")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	case "windows":
		_, err := runCmd("powershell", "-Command", "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,"+strconv.Itoa(req.Level)+")")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported OS"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "level": req.Level})
}

func (h *RemoteHandler) BrightnessUp(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		out, _ := runCmd("brightness", "-l")
		level := parseBrightness(out)
		newLevel := level + 10
		if newLevel > 100 {
			newLevel = 100
		}
		val := strconv.FormatFloat(float64(newLevel)/100.0, 'f', 2, 64)
		runCmd("brightness", val)
	case "linux":
		runCmd("brightnessctl", "set", "10%+")
	case "windows":
		runCmd("powershell", "-Command", "$b = (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness).CurrentBrightness; $n = [Math]::Min(100, $b + 10); (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,$n)")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *RemoteHandler) BrightnessDown(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		out, _ := runCmd("brightness", "-l")
		level := parseBrightness(out)
		newLevel := level - 10
		if newLevel < 0 {
			newLevel = 0
		}
		val := strconv.FormatFloat(float64(newLevel)/100.0, 'f', 2, 64)
		runCmd("brightness", val)
	case "linux":
		runCmd("brightnessctl", "set", "10%-")
	case "windows":
		runCmd("powershell", "-Command", "$b = (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness).CurrentBrightness; $n = [Math]::Max(0, $b - 10); (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,$n)")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *RemoteHandler) ScreenOff(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		runCmd("pmset", "displaysleepnow")
	case "linux":
		runCmd("xset", "dpms", "force", "off")
	case "windows":
		runCmd("powershell", "-Command", "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class Screen{[DllImport(\"user32.dll\")]public static extern int SendMessage(int hWnd,int Msg,int wParam,int lParam);}'; [Screen]::SendMessage(0xFFFF, 0x0112, 0xF170, 2)")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *RemoteHandler) ScreenOn(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		runCmd("caffeinate", "-u", "-t", "1")
	case "linux":
		runCmd("xset", "dpms", "force", "on")
	case "windows":
		runCmd("powershell", "-Command", "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class Screen{[DllImport(\"user32.dll\")]public static extern int SendMessage(int hWnd,int Msg,int wParam,int lParam);}'; [Screen]::SendMessage(0xFFFF, 0x0112, 0xF170, -1)")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func parseAmixerVolume(out string) int {
	for _, line := range strings.Split(out, "\n") {
		if strings.Contains(line, "[") && strings.Contains(line, "%") {
			start := strings.Index(line, "[")
			end := strings.Index(line, "%")
			if start >= 0 && end > start {
				val, _ := strconv.Atoi(line[start+1 : end])
				return val
			}
		}
	}
	return 0
}

func parseBrightness(out string) int {
	for _, line := range strings.Split(out, "\n") {
		if strings.Contains(line, "brightness") {
			parts := strings.Fields(line)
			for _, p := range parts {
				if f, err := strconv.ParseFloat(p, 64); err == nil && f >= 0 && f <= 1 {
					return int(f * 100)
				}
			}
		}
	}
	return 50
}
