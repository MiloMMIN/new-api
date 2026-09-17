/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package controller

import (
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// farmManagerBase 指向 farm-manager 统一入口。
// 容器化部署时 new-api 与 farm 同处 farm-net，由 compose 注入
// FARM_MANAGER_URL=http://farm:18700；原生模式回退到本机默认端口。
func farmManagerBase() string {
	if u := os.Getenv("FARM_MANAGER_URL"); u != "" {
		return u
	}
	return "http://127.0.0.1:9000"
}

// farmToken 读取 farm serve 首次启动时生成并持久化的访问 token
// （仓库根目录 .farm/config.json，即 new-api 工作目录的上一级）。
func farmToken() string {
	path := os.Getenv("FARM_CONFIG")
	if path == "" {
		path = filepath.Join("..", ".farm", "config.json")
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	var cfg struct {
		Token string `json:"token"`
	}
	if err := common.Unmarshal(b, &cfg); err != nil {
		return ""
	}
	return cfg.Token
}

// proxyFarm 把 /api/farmctl/<path> 原样转发给 farm-manager 的
// /api/farm/<path>（带 token），让仪表盘在 new-api 自己的
// 管理员会话下即可操作 farm，不要求浏览器持有 farm token。
func proxyFarm(c *gin.Context, path string) {
	token := farmToken()
	if token == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"message": "farm config unavailable",
		})
		return
	}
	req, err := http.NewRequestWithContext(
		c.Request.Context(),
		c.Request.Method,
		farmManagerBase()+"/api/farm/"+path,
		c.Request.Body,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := service.GetHttpClient().Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"success": false, "message": "farm unreachable"})
		return
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"success": false, "message": "farm response unreadable"})
		return
	}
	c.Data(resp.StatusCode, "application/json; charset=utf-8", body)
}

// FarmConfig 转发 /api/farmctl/config → farm /api/farm/config（LAN/H2C 开关）。
func FarmConfig(c *gin.Context) { proxyFarm(c, "config") }

// FarmTunnel 转发 /api/farmctl/tunnel → farm /api/farm/tunnel（公网隧道管理）。
func FarmTunnel(c *gin.Context) { proxyFarm(c, "tunnel") }
