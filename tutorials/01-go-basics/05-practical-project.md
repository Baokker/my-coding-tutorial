# 05 - 实战项目：并发 Web 爬虫

## 项目目标

```
用前四节学到的所有知识，写一个并发 Web 爬虫：

  ┌─────────────────────────────────────────────────────────┐
  │                   并发 Web 爬虫架构                      │
  │                                                         │
  │   ┌──────────┐     ┌────────────┐     ┌──────────────┐  │
  │   │  URL 队列 │────▶│ Worker Pool│────▶│  结果收集器   │  │
  │   │ (channel) │     │ (N个并发)   │     │  (channel)   │  │
  │   └──────────┘     └────────────┘     └──────────────┘  │
  │        ▲                 │                    │         │
  │        │                 │                    ▼         │
  │        │    发现新URL     │              ┌──────────┐   │
  │        └─────────────────┘              │  输出结果  │   │
  │                                         └──────────┘   │
  │                                                         │
  │   涉及知识点：                                           │
  │   ✓ goroutine + WaitGroup                               │
  │   ✓ channel (带缓冲)                                    │
  │   ✓ sync.Mutex (去重)                                   │
  │   ✓ context (超时控制)                                   │
  │   ✓ 结构体 + 接口 + 错误处理                             │
  └─────────────────────────────────────────────────────────┘
```

---

## 完整代码

### 第一步：定义数据结构

```go
package main

import (
    "context"
    "fmt"
    "io"
    "net/http"
    "regexp"
    "strings"
    "sync"
    "time"
)

// 爬取结果
type CrawlResult struct {
    URL        string
    StatusCode int
    Title      string
    Links      []string
    Error      error
    Duration   time.Duration
}

// 爬虫主结构
type Crawler struct {
    client     *http.Client
    maxWorkers int
    maxDepth   int
    visited    map[string]bool  // 已访问的 URL
    mu         sync.Mutex       // 保护 visited 的并发安全
}

func NewCrawler(maxWorkers, maxDepth int, timeout time.Duration) *Crawler {
    return &Crawler{
        client: &http.Client{
            Timeout: timeout,
        },
        maxWorkers: maxWorkers,
        maxDepth:   maxDepth,
        visited:    make(map[string]bool),
    }
}
```

```
数据结构关系图：

  ┌──────────────────────────────────┐
  │           Crawler                │
  │                                  │
  │  client ────▶ http.Client        │
  │               └─ Timeout: 10s   │
  │                                  │
  │  maxWorkers: 5    (并发数)       │
  │  maxDepth:   2    (最大深度)     │
  │                                  │
  │  visited ────▶ map[string]bool   │
  │  mu ─────────▶ sync.Mutex       │
  │                ↑  保护 visited   │
  └──────────────────────────────────┘

  ┌──────────────────────────────────┐
  │         CrawlResult              │
  │                                  │
  │  URL:        "https://..."       │
  │  StatusCode: 200                 │
  │  Title:      "Page Title"        │
  │  Links:      ["url1","url2",...] │
  │  Error:      nil / error         │
  │  Duration:   150ms               │
  └──────────────────────────────────┘
```

### 第二步：核心爬取逻辑

```go
// 爬取单个页面
func (c *Crawler) fetchPage(ctx context.Context, url string) CrawlResult {
    start := time.Now()

    // 创建带 context 的请求（支持超时取消）
    req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
    if err != nil {
        return CrawlResult{URL: url, Error: err, Duration: time.Since(start)}
    }
    req.Header.Set("User-Agent", "GoCrawler/1.0")

    // 发起 HTTP 请求
    resp, err := c.client.Do(req)
    if err != nil {
        return CrawlResult{URL: url, Error: err, Duration: time.Since(start)}
    }
    defer resp.Body.Close()

    // 读取页面内容（限制最大读取量）
    body, err := io.ReadAll(io.LimitReader(resp.Body, 1024*1024)) // 最多 1MB
    if err != nil {
        return CrawlResult{URL: url, StatusCode: resp.StatusCode, Error: err, Duration: time.Since(start)}
    }

    content := string(body)

    return CrawlResult{
        URL:        url,
        StatusCode: resp.StatusCode,
        Title:      extractTitle(content),
        Links:      extractLinks(content, url),
        Duration:   time.Since(start),
    }
}

// 提取页面标题
func extractTitle(html string) string {
    re := regexp.MustCompile(`<title[^>]*>(.*?)</title>`)
    matches := re.FindStringSubmatch(html)
    if len(matches) > 1 {
        return strings.TrimSpace(matches[1])
    }
    return "(无标题)"
}

// 提取页面中的链接
func extractLinks(html, baseURL string) []string {
    re := regexp.MustCompile(`href=["'](https?://[^"']+)["']`)
    matches := re.FindAllStringSubmatch(html, -1)

    var links []string
    seen := make(map[string]bool)
    for _, match := range matches {
        link := match[1]
        if !seen[link] {
            seen[link] = true
            links = append(links, link)
        }
    }
    return links
}
```

```
单页爬取流程：

  fetchPage("https://example.com")
       │
       ▼
  ┌──────────────────┐
  │ 创建 HTTP 请求    │
  │ + Context 绑定   │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐     超时或取消
  │ 发送请求          │────────────────▶ 返回 Error
  │ client.Do(req)   │
  └────────┬─────────┘
           │ 成功
           ▼
  ┌──────────────────┐
  │ 读取 Body        │
  │ (限制 1MB)       │
  └────────┬─────────┘
           │
           ├──────────────────┐
           ▼                  ▼
  ┌──────────────┐    ┌──────────────┐
  │ 提取 Title   │    │ 提取 Links   │
  │ <title>...</  │    │ href="..."   │
  └──────┬───────┘    └──────┬───────┘
         │                   │
         ▼                   ▼
  ┌──────────────────────────────────┐
  │        CrawlResult               │
  │  URL + Status + Title + Links    │
  └──────────────────────────────────┘
```

### 第三步：并发调度（核心）

```go
// 检查 URL 是否已访问（并发安全）
func (c *Crawler) markVisited(url string) bool {
    c.mu.Lock()
    defer c.mu.Unlock()
    if c.visited[url] {
        return false  // 已访问过
    }
    c.visited[url] = true
    return true  // 首次访问
}

// 启动并发爬取
func (c *Crawler) Crawl(ctx context.Context, seedURLs []string) []CrawlResult {
    var allResults []CrawlResult
    var resultsMu sync.Mutex

    // 用于广度优先遍历的层级处理
    currentLevel := seedURLs

    for depth := 0; depth <= c.maxDepth && len(currentLevel) > 0; depth++ {
        fmt.Printf("\n=== 第 %d 层 (%d 个 URL) ===\n", depth, len(currentLevel))

        // 过滤已访问的 URL
        var toVisit []string
        for _, u := range currentLevel {
            if c.markVisited(u) {
                toVisit = append(toVisit, u)
            }
        }

        if len(toVisit) == 0 {
            break
        }

        // ====== Worker Pool 核心逻辑 ======
        jobs := make(chan string, len(toVisit))
        results := make(chan CrawlResult, len(toVisit))

        // 启动 worker goroutines
        var wg sync.WaitGroup
        numWorkers := c.maxWorkers
        if numWorkers > len(toVisit) {
            numWorkers = len(toVisit)
        }

        for w := 0; w < numWorkers; w++ {
            wg.Add(1)
            go func(workerID int) {
                defer wg.Done()
                for url := range jobs {
                    select {
                    case <-ctx.Done():
                        results <- CrawlResult{URL: url, Error: ctx.Err()}
                        return
                    default:
                        result := c.fetchPage(ctx, url)
                        results <- result
                        fmt.Printf("  Worker %d: %s [%d] %s (%.0fms)\n",
                            workerID, result.URL, result.StatusCode,
                            result.Title, float64(result.Duration.Milliseconds()))
                    }
                }
            }(w)
        }

        // 分发任务
        for _, url := range toVisit {
            jobs <- url
        }
        close(jobs)

        // 等待并收集结果
        go func() {
            wg.Wait()
            close(results)
        }()

        var nextLevel []string
        for result := range results {
            resultsMu.Lock()
            allResults = append(allResults, result)
            resultsMu.Unlock()

            // 收集下一层的 URL
            if depth < c.maxDepth {
                nextLevel = append(nextLevel, result.Links...)
            }
        }

        currentLevel = nextLevel
    }

    return allResults
}
```

```
并发调度的完整流程：

  ┌─────────────────────────────────────────────────────────┐
  │                    Crawl() 主循环                        │
  │                                                         │
  │  for depth = 0; depth <= maxDepth; depth++ {            │
  │                                                         │
  │    第 0 层: [seed1, seed2, seed3]                        │
  │         │                                               │
  │         ▼                                               │
  │    ┌─────────────┐                                      │
  │    │ 过滤已访问   │ ← sync.Mutex 保护                    │
  │    └──────┬──────┘                                      │
  │           ▼                                             │
  │    ┌──────────────────────────────────────┐              │
  │    │          Worker Pool                 │              │
  │    │                                      │              │
  │    │  jobs ─────▶ Worker 0 ─────┐         │              │
  │    │  chan        Worker 1 ─────┤──▶ results │            │
  │    │             Worker 2 ─────┘    chan   │              │
  │    │                                      │              │
  │    └──────────────────────────────────────┘              │
  │           │                                             │
  │           ▼                                             │
  │    收集 results + 提取 next level URLs                   │
  │           │                                             │
  │           ▼                                             │
  │    第 1 层: [link1, link2, ... linkN]                    │
  │           │                                             │
  │           ▼                                             │
  │    (重复上述过程...)                                      │
  │  }                                                      │
  └─────────────────────────────────────────────────────────┘
```

### 第四步：主函数

```go
func main() {
    // 创建爬虫：5个并发 worker，最大深度1层，超时10秒
    crawler := NewCrawler(5, 1, 10*time.Second)

    // 整体超时 30 秒
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // 种子 URL
    seeds := []string{
        "https://go.dev",
        "https://pkg.go.dev",
        "https://gobyexample.com",
    }

    fmt.Println("开始爬取...")
    start := time.Now()

    results := crawler.Crawl(ctx, seeds)

    fmt.Printf("\n========== 爬取完成 ==========\n")
    fmt.Printf("总耗时: %v\n", time.Since(start))
    fmt.Printf("爬取页面: %d\n", len(results))

    // 统计
    var success, failed int
    for _, r := range results {
        if r.Error != nil {
            failed++
        } else {
            success++
        }
    }
    fmt.Printf("成功: %d, 失败: %d\n", success, failed)

    // 打印结果摘要
    fmt.Println("\n--- 结果摘要 ---")
    for _, r := range results {
        status := "✓"
        if r.Error != nil {
            status = "✗"
        }
        fmt.Printf("%s [%d] %s - %s (%v)\n",
            status, r.StatusCode, r.Title, r.URL, r.Duration)
    }
}
```

### 运行方式

```bash
# 初始化项目
mkdir crawler && cd crawler
go mod init crawler

# 把上面的代码保存到 main.go，然后运行
go run main.go

# 检测数据竞争
go run -race main.go
```

---

## 知识点回顾

```
这个项目用到了模块一的所有核心知识：

  ┌──────────────────────────────────────────────────────┐
  │  知识点              │  在项目中的应用                  │
  ├──────────────────────────────────────────────────────┤
  │  结构体 (struct)     │  Crawler, CrawlResult          │
  │  方法 (method)       │  c.fetchPage(), c.Crawl()      │
  │  接口 (interface)    │  io.Reader, error               │
  │  指针 (*T)           │  func (c *Crawler) 修改状态     │
  │  切片 ([]T)          │  []string, []CrawlResult       │
  │  Map                 │  visited map[string]bool       │
  │  goroutine           │  go func() { ... }             │
  │  channel             │  jobs, results 通道             │
  │  WaitGroup           │  等待所有 worker 完成            │
  │  Mutex               │  保护 visited map 并发安全      │
  │  context             │  超时取消控制                    │
  │  defer               │  resp.Body.Close(), wg.Done()  │
  │  错误处理            │  if err != nil { ... }         │
  │  闭包                │  go func(workerID int) { }(w)  │
  │  range               │  for url := range jobs { }     │
  │  函数选项模式         │  NewCrawler 参数化构造          │
  └──────────────────────────────────────────────────────┘
```

---

## 进一步练习

```
可以扩展这个爬虫项目来练习更多 Go 知识：

  ┌──────────────────────────────────────────────────────┐
  │  练习 1: 加上速率限制 (rate limiting)                  │
  │          → 用 time.Ticker 控制请求频率                 │
  │                                                      │
  │  练习 2: 把结果写入文件                                │
  │          → 用 os.Create + json.Encoder                │
  │                                                      │
  │  练习 3: 加上 robots.txt 支持                         │
  │          → 解析 robots.txt 尊重爬取规则                │
  │                                                      │
  │  练习 4: 加上命令行参数                                │
  │          → 用 flag 包解析 -workers, -depth 等          │
  │                                                      │
  │  练习 5: 改成 Pipeline 模式                           │
  │          → 抓取 → 解析 → 存储 三个阶段用 channel 连接  │
  └──────────────────────────────────────────────────────┘
```

---

**模块一完成！** 🎉

**下一个模块：** [模块二：Java 高并发编程](../02-java-concurrency/)
