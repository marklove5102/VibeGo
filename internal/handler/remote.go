package handler

import (
	"net/http"
	"os/exec"
	"runtime"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

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
	r.POST("/screen/off", h.ScreenOff)
	r.POST("/screen/on", h.ScreenOn)
}

type volumeRequest struct {
	Level int `json:"level"`
}

func runRemoteCmd(name string, args ...string) (string, error) {
	out, err := exec.Command(name, args...).CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

func (h *RemoteHandler) GetVolume(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		out, err := runRemoteCmd("osascript", "-e", "output volume of (get volume settings)")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		level, _ := strconv.Atoi(out)
		mutedOut, _ := runRemoteCmd("osascript", "-e", "output muted of (get volume settings)")
		muted := mutedOut == "true"
		c.JSON(http.StatusOK, gin.H{"level": level, "muted": muted})
	case "linux":
		out, err := runRemoteCmd("amixer", "get", "Master")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		level := parseAmixerVolume(out)
		muted := strings.Contains(out, "[off]")
		c.JSON(http.StatusOK, gin.H{"level": level, "muted": muted})
	case "windows":
		out, err := runRemoteCmd("powershell", "-Command",
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
		_, err := runRemoteCmd("osascript", "-e", "set volume output volume "+strconv.Itoa(req.Level))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	case "linux":
		_, err := runRemoteCmd("amixer", "set", "Master", strconv.Itoa(req.Level)+"%")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	case "windows":
		script := "$vol = (New-Object -ComObject MMDeviceEnumerator.MMDeviceEnumerator).GetDefaultAudioEndpoint(0,1).AudioEndpointVolume; $vol.MasterVolumeLevelScalar = " + strconv.FormatFloat(float64(req.Level)/100.0, 'f', 2, 64)
		_, err := runRemoteCmd("powershell", "-Command", script)
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
		runRemoteCmd("osascript", "-e", "set volume output volume ((output volume of (get volume settings)) + 5)")
	case "linux":
		runRemoteCmd("amixer", "set", "Master", "5%+")
	case "windows":
		runRemoteCmd("powershell", "-Command", "$vol = (New-Object -ComObject MMDeviceEnumerator.MMDeviceEnumerator).GetDefaultAudioEndpoint(0,1).AudioEndpointVolume; $vol.MasterVolumeLevelScalar = [Math]::Min(1, $vol.MasterVolumeLevelScalar + 0.05)")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *RemoteHandler) VolumeDown(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		runRemoteCmd("osascript", "-e", "set volume output volume ((output volume of (get volume settings)) - 5)")
	case "linux":
		runRemoteCmd("amixer", "set", "Master", "5%-")
	case "windows":
		runRemoteCmd("powershell", "-Command", "$vol = (New-Object -ComObject MMDeviceEnumerator.MMDeviceEnumerator).GetDefaultAudioEndpoint(0,1).AudioEndpointVolume; $vol.MasterVolumeLevelScalar = [Math]::Max(0, $vol.MasterVolumeLevelScalar - 0.05)")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *RemoteHandler) VolumeMute(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		out, _ := runRemoteCmd("osascript", "-e", "output muted of (get volume settings)")
		if out == "true" {
			runRemoteCmd("osascript", "-e", "set volume without output muted")
		} else {
			runRemoteCmd("osascript", "-e", "set volume with output muted")
		}
	case "linux":
		runRemoteCmd("amixer", "set", "Master", "toggle")
	case "windows":
		runRemoteCmd("powershell", "-Command", "$vol = (New-Object -ComObject MMDeviceEnumerator.MMDeviceEnumerator).GetDefaultAudioEndpoint(0,1).AudioEndpointVolume; $vol.Mute = !$vol.Mute")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *RemoteHandler) MediaPlayPause(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		darwinSendMediaKey(16)
	case "linux":
		runRemoteCmd("playerctl", "play-pause")
	case "windows":
		runRemoteCmd("powershell", "-Command", "$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys([char]0xB3)")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *RemoteHandler) MediaNext(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		darwinSendMediaKey(17)
	case "linux":
		runRemoteCmd("playerctl", "next")
	case "windows":
		runRemoteCmd("powershell", "-Command", "$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys([char]0xB0)")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *RemoteHandler) MediaPrevious(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		darwinSendMediaKey(18)
	case "linux":
		runRemoteCmd("playerctl", "previous")
	case "windows":
		runRemoteCmd("powershell", "-Command", "$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys([char]0xB1)")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *RemoteHandler) ScreenOff(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		runRemoteCmd("pmset", "displaysleepnow")
	case "linux":
		runRemoteCmd("xset", "dpms", "force", "off")
	case "windows":
		runRemoteCmd("powershell", "-Command", "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class Screen{[DllImport(\"user32.dll\")]public static extern int SendMessage(int hWnd,int Msg,int wParam,int lParam);}'; [Screen]::SendMessage(0xFFFF, 0x0112, 0xF170, 2)")
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *RemoteHandler) ScreenOn(c *gin.Context) {
	switch runtime.GOOS {
	case "darwin":
		runRemoteCmd("caffeinate", "-u", "-t", "1")
	case "linux":
		runRemoteCmd("xset", "dpms", "force", "on")
	case "windows":
		runRemoteCmd("powershell", "-Command", "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class Screen{[DllImport(\"user32.dll\")]public static extern int SendMessage(int hWnd,int Msg,int wParam,int lParam);}'; [Screen]::SendMessage(0xFFFF, 0x0112, 0xF170, -1)")
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
