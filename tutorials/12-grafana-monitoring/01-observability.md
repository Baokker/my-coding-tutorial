# 01 - 可观测性与 Prometheus + Grafana

## 可观测性三支柱

```
┌──────────────────────────────────────────────────────────────┐
│                   可观测性 (Observability)                     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Metrics     │  │    Logs      │  │   Traces     │       │
│  │   指标         │  │    日志       │  │   链路追踪    │       │
│  │              │  │              │  │              │       │
│  │  "发生了多少" │  │  "发生了什么" │  │  "怎么发生的" │       │
│  │              │  │              │  │              │       │
│  │  CPU 90%     │  │  ERROR: nil  │  │  A→B→C→D    │       │
│  │  QPS 5000    │  │  pointer     │  │  每段耗时    │       │
│  │  P99 200ms   │  │  dereference │  │  在哪卡了    │       │
│  │              │  │              │  │              │       │
│  │  Prometheus  │  │  ELK / Loki  │  │  Jaeger      │       │
│  │  + Grafana   │  │  + Grafana   │  │  Zipkin      │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  打比方:                                                     │
│  Metrics = 汽车仪表盘 (速度/油量/转速)                        │
│  Logs    = 行车记录仪 (发生了什么事件)                        │
│  Traces  = GPS导航 (每段路怎么走的、在哪堵车)                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 1. Prometheus + Grafana 架构

```
┌──────────────────────────────────────────────────────────────────┐
│                Prometheus + Grafana 监控体系                      │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                      │
│  │  App 1   │  │  App 2   │  │  App 3   │  ← Go 应用暴露指标   │
│  │ :9090/   │  │ :9090/   │  │ :9090/   │                      │
│  │ metrics  │  │ metrics  │  │ metrics  │                      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                      │
│       │              │              │                            │
│       │    Pull 拉取模型             │                            │
│       └──────────────┼──────────────┘                            │
│                      │                                           │
│               ┌──────▼──────┐                                    │
│               │ Prometheus  │  时序数据库                         │
│               │             │  定期拉取各 App 的 /metrics         │
│               │ • 存储指标   │  存储 → 提供 PromQL 查询           │
│               │ • 告警规则   │                                    │
│               │ • PromQL    │                                    │
│               └──────┬──────┘                                    │
│                      │                                           │
│            ┌─────────┼─────────┐                                 │
│            ▼                   ▼                                  │
│  ┌──────────────┐    ┌──────────────┐                            │
│  │  Grafana     │    │ AlertManager│                            │
│  │              │    │              │                            │
│  │  可视化仪表盘 │    │ 告警通知     │                            │
│  │  查询 Prom    │    │ 邮件/钉钉   │                            │
│  │  展示图表     │    │ Slack/PagerD│                            │
│  └──────────────┘    └──────────────┘                            │
│                                                                  │
│  Pull vs Push:                                                   │
│  ┌──────────────────────────────────────────────┐                │
│  │  Prometheus = Pull 模型                       │                │
│  │  Prometheus 主动去各应用拉取指标               │                │
│  │  应用只需暴露 HTTP /metrics 端点               │                │
│  │                                              │                │
│  │  优势: 应用不需要知道 Prometheus 的地址         │                │
│  │       挂一个应用不影响其他监控                  │                │
│  └──────────────────────────────────────────────┘                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Prometheus 四种指标类型

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  1. Counter (计数器) — 只增不减                              │
│     ┌─────────────────────────────┐                         │
│     │  ▁▂▃▄▅▆▇█                   │  例: 请求总数           │
│     │  总是递增                     │      http_requests_total│
│     └─────────────────────────────┘                         │
│     用 rate() 函数算 QPS: rate(http_requests_total[5m])     │
│                                                              │
│  2. Gauge (仪表盘) — 可增可减                                │
│     ┌─────────────────────────────┐                         │
│     │  ▂▅▇▅▃▆▇▄▂                   │  例: CPU使用率         │
│     │  上下波动                     │      当前连接数         │
│     └─────────────────────────────┘      goroutine 数       │
│                                                              │
│  3. Histogram (直方图) — 分布统计                            │
│     ┌─────────────────────────────┐                         │
│     │  ██                          │  例: 请求延迟分布       │
│     │  ████                        │                         │
│     │  ██████                      │  bucket:               │
│     │  ████████ ████               │  ≤10ms: 100次          │
│     │  ──────────────              │  ≤50ms: 400次          │
│     │  10 50 100 500 ms            │  ≤100ms: 800次         │
│     └─────────────────────────────┘  ≤500ms: 950次         │
│     可以计算 P50/P90/P99 分位数                              │
│                                                              │
│  4. Summary (摘要) — 类似 Histogram 但客户端计算              │
│     直接在客户端算好 P50/P99                                 │
│     一般用 Histogram 更灵活                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Go 应用埋点实战

```go
package main

import (
    "math/rand"
    "net/http"
    "time"

    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promhttp"
)

// ===== 定义指标 =====
var (
    // Counter: HTTP 请求总数
    httpRequestsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "http_requests_total",
            Help: "HTTP 请求总数",
        },
        []string{"method", "path", "status"}, // 标签维度
    )

    // Histogram: 请求延迟分布
    httpRequestDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "http_request_duration_seconds",
            Help:    "HTTP 请求延迟",
            Buckets: []float64{0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5},
        },
        []string{"method", "path"},
    )

    // Gauge: 当前活跃连接数
    activeConnections = prometheus.NewGauge(
        prometheus.GaugeOpts{
            Name: "active_connections",
            Help: "当前活跃连接数",
        },
    )
)

func init() {
    prometheus.MustRegister(httpRequestsTotal)
    prometheus.MustRegister(httpRequestDuration)
    prometheus.MustRegister(activeConnections)
}

// ===== 中间件: 自动记录每个请求的指标 =====
func metricsMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        activeConnections.Inc()  // +1
        defer activeConnections.Dec() // -1

        next.ServeHTTP(w, r)

        duration := time.Since(start).Seconds()
        httpRequestsTotal.WithLabelValues(r.Method, r.URL.Path, "200").Inc()
        httpRequestDuration.WithLabelValues(r.Method, r.URL.Path).Observe(duration)
    })
}

// ===== 业务处理 =====
func handleAPI(w http.ResponseWriter, r *http.Request) {
    // 模拟处理耗时
    time.Sleep(time.Duration(rand.Intn(100)) * time.Millisecond)
    w.Write([]byte(`{"status":"ok"}`))
}

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/api/data", handleAPI)

    // /metrics 端点给 Prometheus 拉取
    mux.Handle("/metrics", promhttp.Handler())

    server := &http.Server{
        Addr:    ":8080",
        Handler: metricsMiddleware(mux),
    }

    println("Server started on :8080")
    println("Metrics at :8080/metrics")
    server.ListenAndServe()
}
```

```
/metrics 端点输出示例:

  # HELP http_requests_total HTTP 请求总数
  # TYPE http_requests_total counter
  http_requests_total{method="GET",path="/api/data",status="200"} 1523

  # HELP http_request_duration_seconds HTTP 请求延迟
  # TYPE http_request_duration_seconds histogram
  http_request_duration_seconds_bucket{method="GET",path="/api/data",le="0.01"} 200
  http_request_duration_seconds_bucket{method="GET",path="/api/data",le="0.05"} 800
  http_request_duration_seconds_bucket{method="GET",path="/api/data",le="0.1"} 1400
  http_request_duration_seconds_bucket{method="GET",path="/api/data",le="+Inf"} 1523
  http_request_duration_seconds_sum{...} 76.15
  http_request_duration_seconds_count{...} 1523

  # HELP active_connections 当前活跃连接数
  # TYPE active_connections gauge
  active_connections 42
```

---

## 4. Grafana Dashboard

```
Grafana Dashboard 常用面板:

  ┌────────────────────────────────────────────────────────────┐
  │  My Service Dashboard                      [Last 1h ▼]    │
  ├────────────────────────┬───────────────────────────────────┤
  │                        │                                   │
  │  QPS (请求/秒)          │  P99 Latency (延迟)               │
  │  ┌────────────────┐    │  ┌────────────────┐              │
  │  │     ╱╲          │    │  │         ╱╲                     │
  │  │    ╱  ╲   ╱╲    │    │  │        ╱  ╲                    │
  │  │ ──╱────╲─╱──╲── │    │  │ ──────╱────╲───── 200ms      │
  │  │  ╱      ╳    ╲  │    │  │      ╱      ╲                 │
  │  └────────────────┘    │  └────────────────┘              │
  │  rate(http_requests    │  histogram_quantile(0.99,        │
  │  _total[5m])           │  rate(http_request_duration      │
  │                        │  _seconds_bucket[5m]))           │
  ├────────────────────────┼───────────────────────────────────┤
  │                        │                                   │
  │  Error Rate (错误率)    │  Active Connections              │
  │  ┌────────────────┐    │  ┌────────────────┐              │
  │  │                 │    │  │   ████                         │
  │  │ ─── 0.1% ───── │    │  │  █████████                     │
  │  │       ╱╲        │    │  │ ████████████                   │
  │  │      ╱  ╲       │    │  │████████████████                │
  │  └────────────────┘    │  └────────────────┘              │
  │  rate(errors[5m])      │  active_connections              │
  │  / rate(total[5m])     │                                   │
  └────────────────────────┴───────────────────────────────────┘

  常用 PromQL:
  ┌──────────────────────────────────────────────────────────┐
  │  QPS:                                                    │
  │  rate(http_requests_total[5m])                           │
  │                                                          │
  │  P99 延迟:                                               │
  │  histogram_quantile(0.99,                                │
  │    rate(http_request_duration_seconds_bucket[5m]))        │
  │                                                          │
  │  错误率:                                                  │
  │  rate(http_requests_total{status=~"5.."}[5m])            │
  │  / rate(http_requests_total[5m])                         │
  │                                                          │
  │  CPU 使用率:                                              │
  │  rate(process_cpu_seconds_total[5m]) * 100               │
  │                                                          │
  │  内存使用:                                                │
  │  process_resident_memory_bytes / 1024 / 1024             │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

---

## 5. Docker Compose 快速搭建

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports: ["8080:8080"]

  prometheus:
    image: prom/prometheus:latest
    ports: ["9090:9090"]
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:latest
    ports: ["3000:3000"]
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
```

```yaml
# prometheus.yml
global:
  scrape_interval: 15s        # 每 15 秒拉取一次

scrape_configs:
  - job_name: 'my-go-app'
    static_configs:
      - targets: ['app:8080']  # 拉取 app 的 /metrics
```

```
启动后:
  Grafana:     http://localhost:3000 (admin/admin)
  Prometheus:  http://localhost:9090
  App Metrics: http://localhost:8080/metrics

  在 Grafana 中:
  1. 添加 Data Source → Prometheus → URL: http://prometheus:9090
  2. 创建 Dashboard → 添加 Panel → 输入 PromQL → 看图表
```

---

## 6. 小结

```
┌──────────────────────────────────────────────────────────┐
│  监控体系速查                                             │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  黄金指标 (Google SRE Four Golden Signals):               │
│  ├── Latency  (延迟):   P50 / P90 / P99                 │
│  ├── Traffic  (流量):   QPS / RPS                        │
│  ├── Errors   (错误率): 5xx / 4xx 比例                   │
│  └── Saturation(饱和度): CPU / 内存 / 队列深度            │
│                                                          │
│  技术栈:                                                  │
│  ├── 指标: Prometheus + Grafana                          │
│  ├── 日志: Loki + Grafana (或 ELK)                       │
│  ├── 链路: Jaeger / Tempo + Grafana                      │
│  └── 告警: AlertManager → 钉钉/Slack/PagerDuty          │
│                                                          │
│  Go 埋点:                                                │
│  ├── prometheus/client_golang                            │
│  ├── 暴露 /metrics HTTP 端点                             │
│  └── 中间件自动采集 QPS / 延迟 / 错误率                   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**模块十二完成！**
