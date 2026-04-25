# 04 - Go 并发编程（重点!）

## 为什么 Go 的并发这么强？

```
┌─────────────────────────────────────────────────────────────────┐
│                     Go 并发 vs 传统并发                          │
├──────────────────────────────┬──────────────────────────────────┤
│       Java / C++ 线程         │        Go Goroutine              │
├──────────────────────────────┼──────────────────────────────────┤
│  OS 线程（1:1 映射）          │  用户态协程（M:N 映射）           │
│  创建成本：~1MB 栈            │  创建成本：~2KB 栈（可增长）      │
│  创建 1万个 → 几 GB 内存      │  创建 100万个 → ~2 GB 内存       │
│  切换：内核态切换（慢）        │  切换：用户态切换（快 10-100x）   │
│  通信：共享内存 + 锁           │  通信：Channel（CSP 模型）       │
│  调度：OS 调度器              │  调度：Go runtime 调度器(GMP)    │
└──────────────────────────────┴──────────────────────────────────┘

  Go 格言："Don't communicate by sharing memory;
            share memory by communicating."
  翻译：不要通过共享内存来通信，而要通过通信来共享内存。
```

---

## 1. Goroutine — 轻量级协程

### 1.1 基本用法

```go
package main

import (
    "fmt"
    "time"
)

func sayHello(name string) {
    for i := 0; i < 3; i++ {
        fmt.Printf("[%s] 第 %d 次打招呼\n", name, i+1)
        time.Sleep(100 * time.Millisecond)
    }
}

func main() {
    // 用 go 关键字启动一个 goroutine（就这么简单！）
    go sayHello("Alice")
    go sayHello("Bob")
    go sayHello("Carol")

    // 主 goroutine 也在运行
    fmt.Println("main: goroutine 已启动")

    // 等待一下，否则 main 退出后所有 goroutine 会被杀死
    time.Sleep(500 * time.Millisecond)
    fmt.Println("main: 结束")
}
```

```
Goroutine 执行时间线：

  时间 ──────────────────────────────────────────────────────▶

  main:   ─[启动3个goroutine]─────[Sleep]──────────────[结束]─
              │  │  │
  Alice:      └─[打招呼1]─[打招呼2]─[打招呼3]─
              │  │
  Bob:        └──[打招呼1]─[打招呼2]─[打招呼3]─
              │
  Carol:      └───[打招呼1]─[打招呼2]─[打招呼3]─

  三个 goroutine 并发执行，输出顺序不确定！
  ⚠️ 用 time.Sleep 等待不可靠，实际中用 sync.WaitGroup
```

### 1.2 sync.WaitGroup — 等待一组 goroutine 完成

```go
package main

import (
    "fmt"
    "sync"
    "time"
)

func worker(id int, wg *sync.WaitGroup) {
    defer wg.Done()  // 完成时计数器减 1

    fmt.Printf("Worker %d: 开始工作\n", id)
    time.Sleep(time.Duration(id) * 100 * time.Millisecond) // 模拟耗时
    fmt.Printf("Worker %d: 工作完成\n", id)
}

func main() {
    var wg sync.WaitGroup

    for i := 1; i <= 5; i++ {
        wg.Add(1)       // 计数器加 1
        go worker(i, &wg) // 注意传指针！
    }

    wg.Wait()  // 阻塞，直到计数器归零
    fmt.Println("所有 worker 完成!")
}
```

```
WaitGroup 工作原理：

  wg.Add(1)    wg.Add(1)    wg.Add(1)
      │            │            │
      ▼            ▼            ▼
  ┌─────────────────────────────────┐
  │        计数器 counter            │
  │                                 │
  │  Add(1)  Add(1)  Add(1)        │
  │    │       │       │           │
  │    ▼       ▼       ▼           │
  │  counter: 0 → 1 → 2 → 3       │
  │                                 │
  │  goroutine 完成后调用 Done():    │
  │  counter: 3 → 2 → 1 → 0        │
  │                     │           │
  │              Wait() 解除阻塞 ──┘ │
  └─────────────────────────────────┘

  ⚠️ 常见错误：
  1. wg.Add(1) 必须在 go func() 之前调用
  2. worker 函数参数必须传 *sync.WaitGroup（指针）
  3. 忘记调用 Done() 会导致 Wait() 永远阻塞（死锁）
```

---

## 2. Channel — 协程间的通信管道

### 2.1 Channel 的概念

```
Channel 是 goroutine 之间传递数据的管道：

  Goroutine A                              Goroutine B
  ┌──────────┐    channel (管道)           ┌──────────┐
  │          │   ┌───┬───┬───┬───┐       │          │
  │  ch <- v │──▶│ v │   │   │   │──────▶│ v = <-ch │
  │  (发送)   │   └───┴───┴───┴───┘       │  (接收)  │
  └──────────┘                            └──────────┘

  无缓冲 Channel (make(chan T)):
  ┌─────┐   发送方阻塞，直到接收方准备好
  │     │   →  同步通信，像 "当面交接"
  └─────┘

  有缓冲 Channel (make(chan T, n)):
  ┌───┬───┬───┐   缓冲区未满时发送方不阻塞
  │   │   │   │   →  异步通信，像 "快递柜"
  └───┴───┴───┘
```

### 2.2 基本操作

```go
package main

import "fmt"

func main() {
    // ===== 无缓冲 Channel =====
    ch := make(chan string)

    // 发送方（必须在另一个 goroutine）
    go func() {
        ch <- "Hello"   // 发送数据到 channel
        fmt.Println("已发送")
    }()

    msg := <-ch          // 从 channel 接收数据（阻塞直到有数据）
    fmt.Println("收到:", msg)

    // ===== 有缓冲 Channel =====
    buffered := make(chan int, 3)  // 缓冲区大小为 3

    buffered <- 1   // 不阻塞（缓冲区未满）
    buffered <- 2   // 不阻塞
    buffered <- 3   // 不阻塞
    // buffered <- 4  // 这里会阻塞！（缓冲区满了）

    fmt.Println(<-buffered) // 1
    fmt.Println(<-buffered) // 2
    fmt.Println(<-buffered) // 3
}
```

```
无缓冲 vs 有缓冲的时间线：

  无缓冲 Channel：
  Sender:    ──[ch<-v]──────────[继续]──
                  │   阻塞等待
  Receiver:  ────────────[v=<-ch][继续]──
                         ↑ 接收方来了，双方同时继续

  有缓冲 Channel (cap=2)：
  Sender:    ──[ch<-1][ch<-2]──[ch<-3 阻塞...]───[继续]──
                                    │  缓冲满了
  Receiver:  ─────────────────[<-ch]──────────────────────
                               ↑ 取走一个，缓冲有空间了
                                 Sender 解除阻塞
```

### 2.3 Channel 的方向和关闭

```go
package main

import "fmt"

// 只发送的 channel（函数签名中限制方向）
func producer(ch chan<- int) {
    for i := 0; i < 5; i++ {
        ch <- i * i
    }
    close(ch)  // 发送完毕，关闭 channel
}

// 只接收的 channel
func consumer(ch <-chan int) {
    // range 会在 channel 关闭后自动退出循环
    for val := range ch {
        fmt.Println("收到:", val)
    }
    fmt.Println("channel 已关闭，退出")
}

func main() {
    ch := make(chan int, 3)

    go producer(ch)
    consumer(ch)  // 在 main goroutine 中消费
}
```

```
Channel 方向限制：

  make(chan T)       双向 channel
       │
       ├──▶  chan<- T     只写（只能发送）
       │
       └──▶  <-chan T     只读（只能接收）

  func producer(ch chan<- int) {
      ch <- 42      // ✓ 可以发送
      // <-ch       // ✗ 编译错误！不能接收
  }

  func consumer(ch <-chan int) {
      val := <-ch   // ✓ 可以接收
      // ch <- 42   // ✗ 编译错误！不能发送
  }

  这是编译期的安全保障：
  ┌───────────────────────────────────────┐
  │  producer 不可能意外从 channel 读取    │
  │  consumer 不可能意外往 channel 写入    │
  └───────────────────────────────────────┘
```

### 2.4 经典模式：Fan-out / Fan-in

```go
package main

import (
    "fmt"
    "sync"
    "time"
)

// 模拟耗时的任务处理
func processTask(id int) int {
    time.Sleep(100 * time.Millisecond)
    return id * 10
}

func main() {
    tasks := []int{1, 2, 3, 4, 5, 6, 7, 8}
    results := make(chan int, len(tasks))

    // Fan-out: 启动多个 worker 并发处理
    var wg sync.WaitGroup
    numWorkers := 3

    for w := 0; w < numWorkers; w++ {
        wg.Add(1)
        go func(workerID int) {
            defer wg.Done()
            for _, task := range tasks {
                // 简化版：实际应该用 task channel 分发
                if task%numWorkers == workerID {
                    result := processTask(task)
                    results <- result
                    fmt.Printf("Worker %d 处理任务 %d → %d\n", workerID, task, result)
                }
            }
        }(w)
    }

    // Fan-in: 在另一个 goroutine 中等待所有完成
    go func() {
        wg.Wait()
        close(results)
    }()

    // 收集所有结果
    var total int
    for r := range results {
        total += r
    }
    fmt.Println("总计:", total)
}
```

```
Fan-out / Fan-in 模式：

  ┌──────────┐
  │  任务队列  │
  │ [1,2,3.. │
  │  4,5,6.. │
  │  7,8]    │
  └────┬─────┘
       │
       │  Fan-out（扇出）: 分发给多个 worker
       │
       ├────────────────┬────────────────┐
       ▼                ▼                ▼
  ┌─────────┐    ┌─────────┐    ┌─────────┐
  │Worker 0 │    │Worker 1 │    │Worker 2 │
  │处理 3,6  │    │处理 1,4,7│    │处理 2,5,8│
  └────┬────┘    └────┬────┘    └────┬────┘
       │              │              │
       │  Fan-in（扇入）: 汇总结果
       │              │              │
       ▼              ▼              ▼
  ┌──────────────────────────────────────┐
  │         results channel              │
  │    收集所有 worker 的输出              │
  └──────────────────────────────────────┘

  优势：
  - 并行处理，提高吞吐量
  - worker 数量可调节
  - 通过 channel 自然地实现同步
```

---

## 3. select — Channel 的多路复用

```go
package main

import (
    "fmt"
    "time"
)

func main() {
    ch1 := make(chan string)
    ch2 := make(chan string)

    go func() {
        time.Sleep(100 * time.Millisecond)
        ch1 <- "来自 ch1"
    }()

    go func() {
        time.Sleep(200 * time.Millisecond)
        ch2 <- "来自 ch2"
    }()

    // select 同时监听多个 channel
    for i := 0; i < 2; i++ {
        select {
        case msg := <-ch1:
            fmt.Println("收到:", msg)
        case msg := <-ch2:
            fmt.Println("收到:", msg)
        }
    }

    // ===== 带超时的 select =====
    ch := make(chan int)
    select {
    case val := <-ch:
        fmt.Println("收到:", val)
    case <-time.After(1 * time.Second):
        fmt.Println("超时了！")
    }

    // ===== 非阻塞 select（配合 default）=====
    select {
    case val := <-ch:
        fmt.Println("收到:", val)
    default:
        fmt.Println("没有数据，继续干别的")
    }
}
```

```
select 的工作方式：

  select 类似 switch，但专门用于 channel 操作

  select {
  case msg := <-ch1:   ──┐
      // 处理 ch1 消息    │
  case msg := <-ch2:   ──┤  哪个 channel 先准备好
      // 处理 ch2 消息    │  就执行哪个 case
  case ch3 <- value:   ──┤  （如果多个同时就绪，随机选一个）
      // 发送成功        │
  default:             ──┘  都没准备好就执行 default
      // 都没准备好
  }

  常见用法：

  ┌─────────────────────────────────────────────────┐
  │  1. 超时控制:                                    │
  │     case <-time.After(5*time.Second):            │
  │                                                 │
  │  2. 取消信号:                                    │
  │     case <-ctx.Done():                          │
  │                                                 │
  │  3. 多路监听:                                    │
  │     同时处理多个 channel 的数据                    │
  │                                                 │
  │  4. 非阻塞操作:                                  │
  │     配合 default 实现尝试性收发                    │
  └─────────────────────────────────────────────────┘
```

---

## 4. 互斥锁（Mutex）

```go
package main

import (
    "fmt"
    "sync"
)

// 不安全的并发计数器
type UnsafeCounter struct {
    count int
}

// 安全的并发计数器
type SafeCounter struct {
    mu    sync.Mutex
    count int
}

func (c *SafeCounter) Increment() {
    c.mu.Lock()         // 加锁
    defer c.mu.Unlock() // 函数返回时解锁
    c.count++
}

func (c *SafeCounter) Value() int {
    c.mu.Lock()
    defer c.mu.Unlock()
    return c.count
}

func main() {
    counter := &SafeCounter{}
    var wg sync.WaitGroup

    // 启动 1000 个 goroutine 同时递增
    for i := 0; i < 1000; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            counter.Increment()
        }()
    }

    wg.Wait()
    fmt.Println("最终计数:", counter.Value()) // 一定是 1000
}
```

```
数据竞争(Data Race) 问题：

  没有锁的情况：
  Goroutine A                    Goroutine B
      │                              │
      │  读取 count = 5              │
      │         │                    │  读取 count = 5
      │         ▼                    │         │
      │  count = 5 + 1              │         ▼
      │         │                    │  count = 5 + 1
      │         ▼                    │         │
      │  写回 count = 6              │         ▼
      │                              │  写回 count = 6  ← 丢失一次递增!
      ▼                              ▼

  期望: 7   实际: 6   (Lost Update!)

  加锁后：
  Goroutine A                    Goroutine B
      │                              │
      │  Lock() ✓                    │  Lock() 阻塞...
      │  读取 count = 5              │      │
      │  count = 6                   │      │  等待...
      │  写回 count = 6              │      │
      │  Unlock()                    │      │
      │                              │  Lock() ✓ (获得锁)
      ▼                              │  读取 count = 6
                                     │  count = 7
                                     │  写回 count = 7
                                     │  Unlock()
                                     ▼
  结果正确: 7

  ┌─────────────────────────────────────────────┐
  │  检测数据竞争：go run -race main.go          │
  │  这个 flag 能帮你发现潜在的并发 bug！          │
  └─────────────────────────────────────────────┘
```

### sync.RWMutex — 读写锁

```go
package main

import (
    "fmt"
    "sync"
    "time"
)

type Cache struct {
    mu    sync.RWMutex
    items map[string]string
}

func NewCache() *Cache {
    return &Cache{items: make(map[string]string)}
}

// 读操作用 RLock（多个 goroutine 可以同时读）
func (c *Cache) Get(key string) (string, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()
    val, ok := c.items[key]
    return val, ok
}

// 写操作用 Lock（独占）
func (c *Cache) Set(key, value string) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.items[key] = value
}

func main() {
    cache := NewCache()
    cache.Set("name", "Alice")

    var wg sync.WaitGroup
    // 模拟大量并发读
    for i := 0; i < 100; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            val, _ := cache.Get("name")
            _ = val
        }()
    }

    wg.Wait()
    fmt.Println("并发读写完成")
}
```

```
Mutex vs RWMutex：

  sync.Mutex (互斥锁):
  ┌─────────────────────────────────┐
  │  读A ─Lock── │                  │
  │  读B ───阻塞──│                  │
  │  读C ───阻塞──│                  │
  │  写D ───阻塞──│                  │
  │               │  读A Unlock     │
  │               │  → 读B Lock     │
  └─────────────────────────────────┘
  同一时间只有一个操作（不管读写）

  sync.RWMutex (读写锁):
  ┌─────────────────────────────────┐
  │  读A ─RLock─ │                  │
  │  读B ─RLock─ │  同时进行!        │
  │  读C ─RLock─ │                  │
  │  写D ──阻塞──│                  │
  │              │  所有读完成       │
  │              │  → 写D Lock      │
  └─────────────────────────────────┘
  多个读可以并发，写必须独占

  选择指南：
  ┌───────────────────────────────────┐
  │  读多写少 → RWMutex（并发读更快）  │
  │  读写均衡 → Mutex（RWMutex 有额外  │
  │            开销，不一定更快）       │
  └───────────────────────────────────┘
```

---

## 5. GMP 调度模型 — Go 并发的核心引擎

```
这是理解 Go 并发性能的关键！

  G = Goroutine（用户态协程）
  M = Machine（OS 线程）
  P = Processor（逻辑处理器，调度上下文）

  ┌─────────────────────────────────────────────────────────────┐
  │                      GMP 调度模型                            │
  │                                                             │
  │  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐      全局队列          │
  │  │ G1  │  │ G2  │  │ G3  │  │ G4  │  ┌──────────────┐     │
  │  └──┬──┘  └──┬──┘  └──┬──┘  └──┬──┘  │ G10 G11 G12  │     │
  │     │        │        │        │      └──────────────┘     │
  │     ▼        ▼        ▼        ▼                           │
  │  ┌─────────────┐  ┌─────────────┐                          │
  │  │      P0     │  │      P1     │  ← 逻辑处理器             │
  │  │             │  │             │    (GOMAXPROCS 个)        │
  │  │ 本地队列:    │  │ 本地队列:    │                          │
  │  │ [G5,G6,G7] │  │ [G8,G9]    │                          │
  │  └──────┬──────┘  └──────┬──────┘                          │
  │         │                │                                 │
  │         ▼                ▼                                 │
  │  ┌─────────────┐  ┌─────────────┐                          │
  │  │      M0     │  │      M1     │  ← OS 线程               │
  │  │  (OS线程)   │  │  (OS线程)   │                          │
  │  └──────┬──────┘  └──────┬──────┘                          │
  │         │                │                                 │
  │  ═══════╧════════════════╧═══════════  操作系统             │
  │              CPU 内核调度                                    │
  └─────────────────────────────────────────────────────────────┘

  数量关系：
  ┌──────────────────────────────────────────┐
  │  G 的数量：可以有几十万甚至上百万           │
  │  P 的数量：默认 = CPU 核心数               │
  │           (由 GOMAXPROCS 控制)            │
  │  M 的数量：按需创建，通常略多于 P           │
  └──────────────────────────────────────────┘
```

### 调度流程详解

```
1. Goroutine 的生命周期：

   创建                            执行                     完成
   go func() ──▶ 放入 P 的本地队列 ──▶ 被 M 取出执行 ──▶ 销毁
                      │
                      │ 如果本地队列满了
                      ▼
                 放入全局队列


2. 调度触发时机：

   ┌──────────────────────────────────────────────────────┐
   │  触发时机              │  发生了什么                   │
   ├──────────────────────────────────────────────────────┤
   │  channel 阻塞          │  G 被挂起，M 执行下一个 G    │
   │  系统调用(syscall)      │  M 被阻塞，P 转移给新的 M   │
   │  time.Sleep            │  G 被挂起，放入计时器         │
   │  go func()             │  新 G 加入队列               │
   │  runtime.Gosched()     │  主动让出执行权              │
   │  函数调用(栈检查点)     │  检查是否需要抢占            │
   └──────────────────────────────────────────────────────┘


3. Work Stealing（工作窃取）：

   P0 的本地队列空了！
   ┌──────────┐        ┌──────────┐
   │    P0    │  偷!   │    P1    │
   │ 队列:[]  │ ◀────  │ 队列:    │
   │ (空闲)   │        │ [G5,G6,  │
   └──────────┘        │  G7,G8]  │
                       └──────────┘

   P0 会从 P1 的队列里偷走一半的 G 来执行

   偷取顺序：
   ① 先看本地队列
   ② 再看全局队列
   ③ 最后偷其他 P 的（偷一半）
   ④ 都没有 → M 休眠，等待唤醒


4. 系统调用时的处理（Hand-off 机制）：

   G1 发起 syscall（如读文件）：

   之前:                        之后:
   ┌────┐                      ┌────┐
   │ P0 │                      │ P0 │ ← 转给新的 M2
   └─┬──┘                      └─┬──┘
     │                           │
   ┌─┴──┐                     ┌─┴──┐   ┌────┐
   │ M0 │                     │ M2 │   │ M0 │ ← 被 syscall 阻塞
   │ G1 │                     │ G5 │   │ G1 │
   └────┘                     └────┘   └────┘

   P0 不能等 M0，把自己的本地队列交给 M2 继续处理
   M0 在 syscall 完成后会回收或休眠
```

### GMP 参数调优

```go
package main

import (
    "fmt"
    "runtime"
)

func main() {
    // 查看和设置 P 的数量
    fmt.Println("CPU 核心数:", runtime.NumCPU())
    fmt.Println("当前 GOMAXPROCS:", runtime.GOMAXPROCS(0))

    // 设置 P 的数量（通常不需要手动设置）
    // runtime.GOMAXPROCS(4)

    // 查看当前 goroutine 数量
    fmt.Println("Goroutine 数:", runtime.NumGoroutine())
}
```

```
GMP 模型小结：

  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │  为什么 Go 能轻松处理百万并发？                              │
  │                                                          │
  │  1. G 很轻（2KB 栈） → 可以创建海量 goroutine              │
  │  2. M:N 调度         → 少量线程跑大量协程                   │
  │  3. Work Stealing    → 负载自动均衡                        │
  │  4. Hand-off         → 系统调用不阻塞其他 G                 │
  │  5. 用户态切换        → 不需要进内核，极快                   │
  │                                                          │
  │  对比：                                                    │
  │  Java 1万线程 ≈ 10GB 内存，线程切换开销大                    │
  │  Go  100万goroutine ≈ 2GB 内存，切换几乎无开销              │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

---

## 6. 实用并发模式汇总

### 6.1 Worker Pool（工作池）

```go
package main

import (
    "fmt"
    "sync"
    "time"
)

func workerPool() {
    const numWorkers = 3
    jobs := make(chan int, 100)
    results := make(chan int, 100)

    // 启动 worker
    var wg sync.WaitGroup
    for w := 0; w < numWorkers; w++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            for job := range jobs {  // 从 jobs channel 取任务
                time.Sleep(50 * time.Millisecond)
                results <- job * 2
                fmt.Printf("Worker %d 完成任务 %d\n", id, job)
            }
        }(w)
    }

    // 发送任务
    for j := 1; j <= 10; j++ {
        jobs <- j
    }
    close(jobs)  // 关闭 jobs channel，worker 会退出 range 循环

    // 等待所有 worker 完成
    wg.Wait()
    close(results)

    // 收集结果
    for r := range results {
        fmt.Println("结果:", r)
    }
}

func main() {
    workerPool()
}
```

```
Worker Pool 架构：

  ┌──────────────────────────────────────────────────────┐
  │                                                      │
  │   生产者                Worker Pool          收集器   │
  │                                                      │
  │   ┌──────┐   jobs    ┌─────────┐  results  ┌──────┐ │
  │   │      │   chan     │Worker 0 │   chan     │      │ │
  │   │ 发送 │──────────▶│Worker 1 │──────────▶│ 收集 │ │
  │   │ 任务 │           │Worker 2 │           │ 结果 │ │
  │   │      │           └─────────┘           │      │ │
  │   └──────┘                                 └──────┘ │
  │                                                      │
  │   for j := range tasks {    for job := range jobs {  │
  │       jobs <- j                 result <- process(j) │
  │   }                         }                        │
  │   close(jobs)                                        │
  │                                                      │
  └──────────────────────────────────────────────────────┘
```

### 6.2 Context — 取消和超时控制

```go
package main

import (
    "context"
    "fmt"
    "time"
)

func longRunningTask(ctx context.Context, id int) {
    for {
        select {
        case <-ctx.Done():  // 监听取消信号
            fmt.Printf("任务 %d 被取消: %v\n", id, ctx.Err())
            return
        default:
            fmt.Printf("任务 %d 工作中...\n", id)
            time.Sleep(200 * time.Millisecond)
        }
    }
}

func main() {
    // 带超时的 context
    ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
    defer cancel()  // 一定要调用 cancel 释放资源

    go longRunningTask(ctx, 1)
    go longRunningTask(ctx, 2)

    // 等待超时
    <-ctx.Done()
    time.Sleep(100 * time.Millisecond)  // 等 goroutine 打印取消信息
    fmt.Println("所有任务已取消")
}
```

```
Context 传播树：

  context.Background()      ← 根 context（永不取消）
       │
       ├── WithTimeout(5s)  ← 5秒后自动取消
       │       │
       │       ├── 传给 Handler A
       │       │       │
       │       │       └── 传给数据库查询
       │       │
       │       └── 传给 Handler B
       │               │
       │               └── 传给外部 API 调用
       │
       └── WithCancel()     ← 手动取消
               │
               └── 传给后台任务

  取消是向下传播的：
  父 context 取消 → 所有子 context 都被取消
  子 context 取消 → 不影响父和兄弟

  ┌──────────────────────────────────────────┐
  │  Context 是 Go 并发编程的 "生命周期管理器" │
  │  几乎所有 Go 标准库的 IO 操作都接受 ctx   │
  └──────────────────────────────────────────┘
```

---

## 7. 小结

```
┌──────────────────────────────────────────────────────────────┐
│                   Go 并发编程速查表                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  基础:                                                       │
│  ├── go func()         启动 goroutine                        │
│  ├── sync.WaitGroup    等待一组 goroutine 完成                │
│  └── sync.Mutex        互斥锁（保护共享数据）                  │
│                                                              │
│  Channel:                                                    │
│  ├── ch := make(chan T)      无缓冲（同步）                   │
│  ├── ch := make(chan T, n)   有缓冲（异步）                   │
│  ├── ch <- v / v = <-ch     发送 / 接收                      │
│  ├── close(ch)               关闭                            │
│  └── for v := range ch       遍历直到关闭                     │
│                                                              │
│  高级:                                                       │
│  ├── select            多路复用（同时监听多个 channel）        │
│  ├── context           超时、取消、传值                        │
│  └── sync.RWMutex      读写锁（读多写少场景）                  │
│                                                              │
│  模式:                                                       │
│  ├── Worker Pool       固定数量 worker 处理任务流              │
│  ├── Fan-out/Fan-in    并行处理后汇总                         │
│  └── Pipeline          多阶段流水线                           │
│                                                              │
│  调试:                                                       │
│  └── go run -race      检测数据竞争                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**下一节：** [05 - 实战项目](05-practical-project.md) — 写一个并发 Web 爬虫
