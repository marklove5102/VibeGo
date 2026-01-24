package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/xxnuo/vibego/internal/service/process"
)

type ProcessHandler struct {
	service *process.Service
}

func NewProcessHandler() *ProcessHandler {
	return &ProcessHandler{
		service: process.New(),
	}
}

func (h *ProcessHandler) Register(r *gin.RouterGroup) {
	r.GET("/system/stats", h.SystemStats)
	g := r.Group("/process")
	g.GET("", h.List)
	g.GET("/:pid", h.Detail)
	g.POST("/:pid/kill", h.Kill)
}

func (h *ProcessHandler) SystemStats(c *gin.Context) {
	stats, err := h.service.GetSystemStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

func (h *ProcessHandler) List(c *gin.Context) {
	processes, err := h.service.GetProcessList()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"processes": processes})
}

func (h *ProcessHandler) Detail(c *gin.Context) {
	pidStr := c.Param("pid")
	pid, err := strconv.ParseInt(pidStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid pid"})
		return
	}

	info, err := h.service.GetProcessDetail(int32(pid))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, info)
}

type KillProcessRequest struct {
	Signal string `json:"signal"`
}

func (h *ProcessHandler) Kill(c *gin.Context) {
	pidStr := c.Param("pid")
	pid, err := strconv.ParseInt(pidStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid pid"})
		return
	}

	var req KillProcessRequest
	c.ShouldBindJSON(&req)
	if req.Signal == "" {
		req.Signal = "SIGTERM"
	}

	if err := h.service.KillProcess(int32(pid), req.Signal); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
