package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/xxnuo/vibego/internal/service/asr"
)

type ASRHandler struct {
	service *asr.Service
}

func NewASRHandler(service *asr.Service) *ASRHandler {
	return &ASRHandler{service: service}
}

func (h *ASRHandler) Register(r *gin.RouterGroup) {
	r.GET("/asr/info", h.Info)
}

func (h *ASRHandler) Info(c *gin.Context) {
	if h.service == nil {
		c.JSON(http.StatusOK, gin.H{"enabled": false, "message": "speech assets are unavailable"})
		return
	}
	info := h.service.Info()
	c.JSON(http.StatusOK, info)
}
