# 03 - 限流与熔断

## 1. 限流算法

### 令牌桶（Token Bucket）— 最常用

```
┌─────────────────────────────────────────────────────────┐
│                     令牌桶算法                            │
│                                                         │
│        固定速率放入令牌                                    │
│            │                                            │
│            ▼                                            │
│     ┌──────────────┐                                    │
│     │ ○ ○ ○ ○ ○    │ ← 令牌桶（有容量上限）              │
│     │ ○ ○ ○        │                                    │
│     └──────┬───────┘                                    │
│            │                                            │
│    请求来了，取一个令牌                                    │
│            │                                            │
│     ┌──────┴──────┐                                     │
│     │有令牌?       │                                     │
│     ├─Yes──▶ 放行  │                                     │
│     ├─No───▶ 拒绝  │                                     │
│     └─────────────┘                                     │
│                                                         │
│  特点:                                                   │
│  ✓ 允许突发流量（桶里有积累的令牌）                        │
│  ✓ 长期来看限制平均速率                                   │
│  ✓ Guava RateLimiter、Nginx 都用这个                     │
└─────────────────────────────────────────────────────────┘
```

### 漏桶（Leaky Bucket）

```
┌─────────────────────────────────────────────────────────┐
│                     漏桶算法                              │
│                                                         │
│   请求涌入（可能有突发）                                   │
│     │ │ │ │ │ │                                         │
│     ▼ ▼ ▼ ▼ ▼ ▼                                         │
│     ┌──────────────┐                                    │
│     │ ■ ■ ■ ■ ■    │ ← 漏桶（缓冲队列）                  │
│     │ ■ ■ ■        │   满了就溢出（拒绝）                 │
│     └──────┬───────┘                                    │
│            │  固定速率流出                                │
│            ▼                                            │
│        处理请求                                          │
│                                                         │
│  特点:                                                   │
│  ✓ 输出速率恒定（平滑流量）                               │
│  ✗ 不允许突发（即使系统有余力）                            │
│                                                         │
│  令牌桶 vs 漏桶:                                         │
│  ┌─────────────┬──────────────────┐                     │
│  │  令牌桶      │  漏桶             │                     │
│  │  控制平均速率│  控制输出速率      │                     │
│  │  允许突发    │  不允许突发        │                     │
│  │  更常用 ✓   │  流量整形用        │                     │
│  └─────────────┴──────────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

### 滑动窗口

```
固定窗口的问题:
  │←── 窗口1 ──▶│←── 窗口2 ──▶│
  │    限100请求  │    限100请求  │
  │         ■■■■│■■■■         │
  │    在边界处   │ 可能瞬间 200 │

滑动窗口:
  │←── 窗口 ─────────────────▶│
  │     随时间滑动              │
  │  ■ ■ ■ ■ ■ ■ ■ ■          │
  │     统计最近 N 秒内的请求数  │

  任何连续的时间窗口内都不超过限制
  → 比固定窗口更精确
```

### Go 实现令牌桶限流器

```go
package main

import (
    "fmt"
    "sync"
    "time"
)

type TokenBucket struct {
    capacity   int           // 桶容量
    tokens     int           // 当前令牌数
    rate       int           // 每秒放入令牌数
    mu         sync.Mutex
    lastRefill time.Time
}

func NewTokenBucket(capacity, rate int) *TokenBucket {
    return &TokenBucket{
        capacity:   capacity,
        tokens:     capacity, // 初始满桶
        rate:       rate,
        lastRefill: time.Now(),
    }
}

func (tb *TokenBucket) Allow() bool {
    tb.mu.Lock()
    defer tb.mu.Unlock()

    // 计算需要补充的令牌
    now := time.Now()
    elapsed := now.Sub(tb.lastRefill).Seconds()
    newTokens := int(elapsed * float64(tb.rate))

    if newTokens > 0 {
        tb.tokens += newTokens
        if tb.tokens > tb.capacity {
            tb.tokens = tb.capacity
        }
        tb.lastRefill = now
    }

    // 尝试消耗一个令牌
    if tb.tokens > 0 {
        tb.tokens--
        return true  // 放行
    }
    return false  // 限流
}

func main() {
    // 每秒 10 个请求，允许突发 20 个
    limiter := NewTokenBucket(20, 10)

    var allowed, rejected int
    var wg sync.WaitGroup

    // 模拟 100 个并发请求
    for i := 0; i < 100; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            if limiter.Allow() {
                allowed++
            } else {
                rejected++
            }
        }()
    }

    wg.Wait()
    fmt.Printf("放行: %d, 拒绝: %d\n", allowed, rejected)
}
```

---

## 2. 熔断器（Circuit Breaker）

```
┌──────────────────────────────────────────────────────────────┐
│                    熔断器三种状态                               │
│                                                              │
│  ┌─────────┐    失败率 > 阈值    ┌──────────┐               │
│  │  CLOSED  │──────────────────▶│   OPEN   │               │
│  │ (正常)   │                    │ (熔断)    │               │
│  │          │◀─────────┐        │          │               │
│  │ 请求正常  │          │        │ 直接拒绝  │               │
│  │ 通过     │          │        │ 快速失败  │               │
│  └─────────┘   探测成功  │        └────┬─────┘               │
│                   │     │             │                      │
│                   │     │    超时后    │                      │
│            ┌──────┴─────┴──┐  ◀───────┘                     │
│            │  HALF-OPEN    │                                 │
│            │ (半开)        │                                 │
│            │              │                                 │
│            │ 放少量请求探测 │                                 │
│            │ 成功→CLOSED   │                                 │
│            │ 失败→OPEN     │                                 │
│            └──────────────┘                                 │
│                                                              │
│  类比保险丝:                                                  │
│  电流过大 → 保险丝熔断 → 断电保护 → 修好后合闸                  │
│  错误率高 → 熔断器打开 → 快速失败 → 恢复后关闭                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Go 实现简单熔断器

```go
package main

import (
    "errors"
    "fmt"
    "sync"
    "time"
)

type State int

const (
    Closed   State = iota  // 正常
    Open                   // 熔断
    HalfOpen               // 半开（探测中）
)

type CircuitBreaker struct {
    mu             sync.Mutex
    state          State
    failureCount   int
    successCount   int
    threshold      int           // 失败多少次触发熔断
    timeout        time.Duration // 熔断多久后尝试恢复
    lastFailure    time.Time
}

func NewCircuitBreaker(threshold int, timeout time.Duration) *CircuitBreaker {
    return &CircuitBreaker{
        state:     Closed,
        threshold: threshold,
        timeout:   timeout,
    }
}

var ErrCircuitOpen = errors.New("circuit breaker is open")

func (cb *CircuitBreaker) Execute(fn func() error) error {
    cb.mu.Lock()

    switch cb.state {
    case Open:
        // 检查是否超过恢复等待时间
        if time.Since(cb.lastFailure) > cb.timeout {
            cb.state = HalfOpen
            cb.mu.Unlock()
            return cb.tryHalfOpen(fn)
        }
        cb.mu.Unlock()
        return ErrCircuitOpen  // 快速失败

    case HalfOpen:
        cb.mu.Unlock()
        return cb.tryHalfOpen(fn)

    default: // Closed
        cb.mu.Unlock()
    }

    // 正常执行
    err := fn()

    cb.mu.Lock()
    defer cb.mu.Unlock()

    if err != nil {
        cb.failureCount++
        cb.lastFailure = time.Now()
        if cb.failureCount >= cb.threshold {
            cb.state = Open
            fmt.Println("[熔断器] → OPEN (熔断!)")
        }
        return err
    }

    cb.failureCount = 0  // 成功则重置失败计数
    return nil
}

func (cb *CircuitBreaker) tryHalfOpen(fn func() error) error {
    err := fn()

    cb.mu.Lock()
    defer cb.mu.Unlock()

    if err != nil {
        cb.state = Open
        cb.lastFailure = time.Now()
        fmt.Println("[熔断器] 探测失败 → OPEN")
        return err
    }

    cb.state = Closed
    cb.failureCount = 0
    fmt.Println("[熔断器] 探测成功 → CLOSED (恢复!)")
    return nil
}

func main() {
    cb := NewCircuitBreaker(3, 2*time.Second)

    callService := func(shouldFail bool) {
        err := cb.Execute(func() error {
            if shouldFail {
                return errors.New("service unavailable")
            }
            return nil
        })
        if err != nil {
            fmt.Println("请求失败:", err)
        } else {
            fmt.Println("请求成功")
        }
    }

    // 正常请求
    callService(false)
    callService(false)

    // 连续失败触发熔断
    callService(true)
    callService(true)
    callService(true) // 第3次失败 → 熔断

    // 熔断中，直接拒绝
    callService(false) // circuit breaker is open

    // 等待恢复
    fmt.Println("\n等待熔断器恢复...")
    time.Sleep(3 * time.Second)

    // 半开状态探测
    callService(false) // 探测成功 → 恢复
    callService(false) // 正常
}
```

---

## 3. 小结

```
┌──────────────────────────────────────────────────────────┐
│  限流熔断速查                                             │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  限流算法:                                                │
│  ├── 令牌桶: 最常用，允许突发                              │
│  ├── 漏桶: 平滑输出，不允许突发                            │
│  └── 滑动窗口: 精确统计，适合API限流                       │
│                                                          │
│  熔断器:                                                  │
│  ├── Closed → Open → HalfOpen → Closed                  │
│  ├── 失败率超阈值 → 熔断 → 快速失败                       │
│  └── 超时后探测 → 成功则恢复                               │
│                                                          │
│  实际中常用框架:                                           │
│  ├── Go: golang.org/x/time/rate, sony/gobreaker         │
│  ├── Java: Sentinel (阿里), Resilience4j, Hystrix       │
│  └── 网关层: Nginx limit_req, Kong, Envoy               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**下一节：** [04 - 分库分表](04-sharding.md)
