package process

import (
	"os"
	"runtime"
	"sort"
	"syscall"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/process"
)

type CPUStats struct {
	UsagePercent float64 `json:"usagePercent"`
	Cores        int     `json:"cores"`
	ModelName    string  `json:"modelName"`
}

type MemoryStats struct {
	Total       uint64  `json:"total"`
	Used        uint64  `json:"used"`
	Available   uint64  `json:"available"`
	UsedPercent float64 `json:"usedPercent"`
}

type LoadAverage struct {
	Load1  float64 `json:"load1"`
	Load5  float64 `json:"load5"`
	Load15 float64 `json:"load15"`
}

type SystemStats struct {
	CPU        CPUStats    `json:"cpu"`
	Memory     MemoryStats `json:"memory"`
	LoadAvg    LoadAverage `json:"loadAvg"`
	Uptime     uint64      `json:"uptime"`
	NumProcess int         `json:"numProcess"`
	OS         string      `json:"os"`
	Arch       string      `json:"arch"`
	Hostname   string      `json:"hostname"`
}

type ProcessInfo struct {
	PID        int32   `json:"pid"`
	Name       string  `json:"name"`
	Username   string  `json:"username"`
	CPUPercent float64 `json:"cpuPercent"`
	MemPercent float32 `json:"memPercent"`
	MemRSS     uint64  `json:"memRss"`
	Status     string  `json:"status"`
	CreateTime int64   `json:"createTime"`
	Cmdline    string  `json:"cmdline"`
	PPID       int32   `json:"ppid"`
	NumThreads int32   `json:"numThreads"`
}

type Service struct{}

func New() *Service {
	return &Service{}
}

func (s *Service) GetSystemStats() (*SystemStats, error) {
	cpuPercent, err := cpu.Percent(0, false)
	if err != nil {
		return nil, err
	}

	cpuInfo, _ := cpu.Info()
	modelName := ""
	if len(cpuInfo) > 0 {
		modelName = cpuInfo[0].ModelName
	}

	memInfo, err := mem.VirtualMemory()
	if err != nil {
		return nil, err
	}

	loadAvg, err := load.Avg()
	if err != nil {
		loadAvg = &load.AvgStat{}
	}

	hostInfo, err := host.Info()
	if err != nil {
		return nil, err
	}

	processes, _ := process.Processes()

	hostname, _ := os.Hostname()

	cpuUsage := 0.0
	if len(cpuPercent) > 0 {
		cpuUsage = cpuPercent[0]
	}

	return &SystemStats{
		CPU: CPUStats{
			UsagePercent: cpuUsage,
			Cores:        runtime.NumCPU(),
			ModelName:    modelName,
		},
		Memory: MemoryStats{
			Total:       memInfo.Total,
			Used:        memInfo.Used,
			Available:   memInfo.Available,
			UsedPercent: memInfo.UsedPercent,
		},
		LoadAvg: LoadAverage{
			Load1:  loadAvg.Load1,
			Load5:  loadAvg.Load5,
			Load15: loadAvg.Load15,
		},
		Uptime:     hostInfo.Uptime,
		NumProcess: len(processes),
		OS:         runtime.GOOS,
		Arch:       runtime.GOARCH,
		Hostname:   hostname,
	}, nil
}

func (s *Service) GetProcessList() ([]ProcessInfo, error) {
	processes, err := process.Processes()
	if err != nil {
		return nil, err
	}

	result := make([]ProcessInfo, 0, len(processes))
	for _, p := range processes {
		info := ProcessInfo{PID: p.Pid}

		if name, err := p.Name(); err == nil {
			info.Name = name
		}

		if username, err := p.Username(); err == nil {
			info.Username = username
		}

		if cpuPercent, err := p.CPUPercent(); err == nil {
			info.CPUPercent = cpuPercent
		}

		if memPercent, err := p.MemoryPercent(); err == nil {
			info.MemPercent = memPercent
		}

		if memInfo, err := p.MemoryInfo(); err == nil && memInfo != nil {
			info.MemRSS = memInfo.RSS
		}

		if status, err := p.Status(); err == nil && len(status) > 0 {
			info.Status = status[0]
		}

		if createTime, err := p.CreateTime(); err == nil {
			info.CreateTime = createTime
		}

		if cmdline, err := p.Cmdline(); err == nil {
			info.Cmdline = cmdline
		}

		if ppid, err := p.Ppid(); err == nil {
			info.PPID = ppid
		}

		if numThreads, err := p.NumThreads(); err == nil {
			info.NumThreads = numThreads
		}

		result = append(result, info)
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].CPUPercent > result[j].CPUPercent
	})

	return result, nil
}

func (s *Service) GetProcessDetail(pid int32) (*ProcessInfo, error) {
	p, err := process.NewProcess(pid)
	if err != nil {
		return nil, err
	}

	info := &ProcessInfo{PID: pid}

	if name, err := p.Name(); err == nil {
		info.Name = name
	}

	if username, err := p.Username(); err == nil {
		info.Username = username
	}

	if cpuPercent, err := p.CPUPercent(); err == nil {
		info.CPUPercent = cpuPercent
	}

	if memPercent, err := p.MemoryPercent(); err == nil {
		info.MemPercent = memPercent
	}

	if memInfo, err := p.MemoryInfo(); err == nil && memInfo != nil {
		info.MemRSS = memInfo.RSS
	}

	if status, err := p.Status(); err == nil && len(status) > 0 {
		info.Status = status[0]
	}

	if createTime, err := p.CreateTime(); err == nil {
		info.CreateTime = createTime
	}

	if cmdline, err := p.Cmdline(); err == nil {
		info.Cmdline = cmdline
	}

	if ppid, err := p.Ppid(); err == nil {
		info.PPID = ppid
	}

	if numThreads, err := p.NumThreads(); err == nil {
		info.NumThreads = numThreads
	}

	return info, nil
}

func (s *Service) KillProcess(pid int32, signal string) error {
	p, err := process.NewProcess(pid)
	if err != nil {
		return err
	}

	osProcess, err := os.FindProcess(int(pid))
	if err != nil {
		return err
	}

	var sig os.Signal
	switch signal {
	case "SIGTERM", "TERM", "15":
		sig = syscall.SIGTERM
	case "SIGKILL", "KILL", "9":
		sig = syscall.SIGKILL
	case "SIGHUP", "HUP", "1":
		sig = syscall.SIGHUP
	default:
		sig = syscall.SIGTERM
	}

	_ = p
	return osProcess.Signal(sig)
}
