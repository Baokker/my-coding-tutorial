# 04 - 线程池与异步编程

## 为什么需要线程池？

```
没有线程池：每个任务创建一个线程
┌──────────────────────────────────────────────┐
│  请求1 → new Thread() → 执行 → 销毁          │
│  请求2 → new Thread() → 执行 → 销毁          │
│  请求3 → new Thread() → 执行 → 销毁          │
│  ...                                         │
│  请求10000 → OOM! (内存不够创建线程了)         │
│                                              │
│  问题: 线程创建/销毁开销大，数量不可控          │
└──────────────────────────────────────────────┘

有线程池：固定数量的线程复用
┌──────────────────────────────────────────────┐
│  请求1 ─┐                                    │
│  请求2 ─┤    ┌────────────────┐              │
│  请求3 ─┼──▶ │ 任务队列        │ ──▶ Worker 0 │
│  请求4 ─┤    │ [req3,req4...] │ ──▶ Worker 1 │
│  ...   ─┘    └────────────────┘ ──▶ Worker 2 │
│                                              │
│  优势: 线程复用，数量可控，有队列缓冲          │
└──────────────────────────────────────────────┘
```

---

## 1. ThreadPoolExecutor — 七大核心参数

```java
import java.util.concurrent.*;

public class ThreadPoolDemo {
    public static void main(String[] args) {
        // 手动创建线程池（推荐！不要用 Executors 工厂方法）
        ThreadPoolExecutor executor = new ThreadPoolExecutor(
            4,                    // corePoolSize:    核心线程数
            8,                    // maximumPoolSize: 最大线程数
            60, TimeUnit.SECONDS, // keepAliveTime:   非核心线程空闲超时
            new ArrayBlockingQueue<>(100),  // workQueue: 任务队列
            new ThreadPoolExecutor.CallerRunsPolicy()  // 拒绝策略
        );

        // 提交任务
        for (int i = 0; i < 20; i++) {
            int taskId = i;
            executor.execute(() -> {
                System.out.printf("[%s] 执行任务 %d%n",
                    Thread.currentThread().getName(), taskId);
                try { Thread.sleep(1000); } catch (InterruptedException e) {}
            });
        }

        // 优雅关闭
        executor.shutdown();  // 不接受新任务，等已有任务完成
        try {
            if (!executor.awaitTermination(30, TimeUnit.SECONDS)) {
                executor.shutdownNow();  // 强制关闭
            }
        } catch (InterruptedException e) {
            executor.shutdownNow();
        }
    }
}
```

```
ThreadPoolExecutor 七大参数详解：

  new ThreadPoolExecutor(
      corePoolSize,        ①
      maximumPoolSize,     ②
      keepAliveTime, unit, ③
      workQueue,           ④
      threadFactory,       ⑤
      handler              ⑥
  );

  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │  ① corePoolSize = 4 (核心线程，一直存活)                      │
  │  ② maximumPoolSize = 8 (最大线程数)                          │
  │  ③ keepAliveTime = 60s (非核心线程空闲超过60s就销毁)           │
  │                                                             │
  │  ┌───────────────────────────────────────────────────┐      │
  │  │                线程池                              │      │
  │  │                                                   │      │
  │  │  核心线程 (常驻)        非核心线程 (按需创建)        │      │
  │  │  ┌────┐┌────┐┌────┐┌────┐  ┌────┐┌────┐┌────┐┌────┐│    │
  │  │  │ W0 ││ W1 ││ W2 ││ W3 │  │ W4 ││ W5 ││ W6 ││ W7 ││    │
  │  │  └────┘└────┘└────┘└────┘  └────┘└────┘└────┘└────┘│    │
  │  │  ◀── corePoolSize ──▶     ◀── 额外线程 ──▶         │    │
  │  │  ◀──────────── maximumPoolSize ────────────▶       │    │
  │  └───────────────────────────────────────────────────┘     │
  │                          ▲                                  │
  │  ④ workQueue ────────────┘                                  │
  │  ┌──────────────────────────┐                               │
  │  │  任务队列 [T5, T6, T7...]│  ← 来不及处理的任务在这排队      │
  │  └──────────────────────────┘                               │
  │                                                             │
  │  ⑤ threadFactory: 自定义线程名（方便排查问题）                 │
  │  ⑥ handler: 队列也满了怎么办？拒绝策略                        │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘
```

### 任务提交流程

```
新任务到来时的处理流程：

                    提交新任务
                       │
                       ▼
              ┌────────────────┐
              │ 核心线程满了吗？  │
              └───────┬────────┘
                      │
                ┌─────┴─────┐
               No          Yes
                │            │
                ▼            ▼
          创建核心线程   ┌──────────────┐
          执行任务       │ 队列满了吗？  │
                        └──────┬───────┘
                               │
                         ┌─────┴─────┐
                        No          Yes
                         │            │
                         ▼            ▼
                    放入任务队列  ┌──────────────────┐
                                │ 达到最大线程数了吗？│
                                └───────┬──────────┘
                                        │
                                  ┌─────┴─────┐
                                 No          Yes
                                  │            │
                                  ▼            ▼
                            创建非核心线程  执行拒绝策略!
                            执行任务

  注意顺序: 核心线程 → 队列 → 非核心线程 → 拒绝
  不是: 核心线程 → 非核心线程 → 队列！（这是常见误区）
```

### 四种拒绝策略

```
┌──────────────────────┬────────────────────────────────────┐
│  AbortPolicy (默认)   │  直接抛 RejectedExecutionException │
│                      │  → 适合: 关键任务，不允许丢失       │
├──────────────────────┼────────────────────────────────────┤
│  CallerRunsPolicy    │  由调用者线程自己执行任务             │
│                      │  → 适合: 需要所有任务都执行的场景    │
│                      │    （自然起到降速作用）              │
├──────────────────────┼────────────────────────────────────┤
│  DiscardPolicy       │  默默丢弃，不抛异常                 │
│                      │  → 适合: 允许丢失的非关键任务       │
├──────────────────────┼────────────────────────────────────┤
│  DiscardOldestPolicy │  丢弃队列最前面的任务，重新提交      │
│                      │  → 适合: 新任务比旧任务重要的场景    │
└──────────────────────┴────────────────────────────────────┘
```

### 线程池大小经验公式

```
┌──────────────────────────────────────────────────────────┐
│  CPU 密集型（计算多、IO 少）：                              │
│  线程数 = CPU 核心数 + 1                                  │
│  例: 8 核 CPU → 9 个线程                                  │
│                                                          │
│  IO 密集型（网络请求、数据库、文件读写）：                   │
│  线程数 = CPU 核心数 × 2 ~ CPU 核心数 ÷ (1 - IO占比)     │
│  例: 8 核 CPU，80% 时间在等 IO → 8 ÷ 0.2 = 40 个线程     │
│                                                          │
│  实际建议：                                                │
│  ┌──────────────────────────────────────────────┐        │
│  │  不要纸上谈兵，用压测来确定最佳线程数!          │        │
│  │  监控: 队列大小、活跃线程数、任务完成时间         │        │
│  └──────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────┘
```

---

## 2. CompletableFuture — 异步编程利器

```java
import java.util.concurrent.CompletableFuture;

public class CompletableFutureDemo {

    // 模拟异步获取用户信息
    static CompletableFuture<String> fetchUser(int userId) {
        return CompletableFuture.supplyAsync(() -> {
            sleep(500);
            return "User-" + userId;
        });
    }

    // 模拟异步获取订单
    static CompletableFuture<String> fetchOrder(String userId) {
        return CompletableFuture.supplyAsync(() -> {
            sleep(300);
            return "Order-of-" + userId;
        });
    }

    public static void main(String[] args) {
        long start = System.currentTimeMillis();

        // 链式调用：获取用户 → 获取订单 → 处理结果
        CompletableFuture<String> result = fetchUser(1)
            .thenCompose(user -> fetchOrder(user))       // 串行依赖
            .thenApply(order -> "处理: " + order)        // 转换结果
            .exceptionally(ex -> "出错: " + ex.getMessage()); // 错误处理

        // 并行执行多个异步任务
        CompletableFuture<String> user1 = fetchUser(1);
        CompletableFuture<String> user2 = fetchUser(2);
        CompletableFuture<String> user3 = fetchUser(3);

        // 等待所有完成
        CompletableFuture.allOf(user1, user2, user3).join();
        System.out.printf("三个并行请求完成，耗时: %dms%n",
            System.currentTimeMillis() - start);  // ~500ms 而非 1500ms

        // 任意一个完成
        CompletableFuture<Object> fastest = CompletableFuture.anyOf(user1, user2);
        System.out.println("最快的: " + fastest.join());

        System.out.println(result.join());
    }

    static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) {}
    }
}
```

```
CompletableFuture 常用 API 速查：

  创建：
  ┌─────────────────────────────────────────────────┐
  │  supplyAsync(() -> result)    有返回值的异步任务  │
  │  runAsync(() -> { })          无返回值的异步任务  │
  └─────────────────────────────────────────────────┘

  转换 / 链式：
  ┌─────────────────────────────────────────────────┐
  │  thenApply(r -> newR)     转换结果（同步）       │
  │  thenCompose(r -> CF)     扁平化（异步串行）      │
  │  thenAccept(r -> {})      消费结果（无返回）      │
  │  thenRun(() -> {})        执行下一步（无输入）     │
  └─────────────────────────────────────────────────┘

  组合：
  ┌─────────────────────────────────────────────────┐
  │  thenCombine(cf, (r1,r2)->r)  合并两个结果      │
  │  allOf(cf1, cf2, cf3)         等所有完成         │
  │  anyOf(cf1, cf2, cf3)         等任一完成         │
  └─────────────────────────────────────────────────┘

  错误处理：
  ┌─────────────────────────────────────────────────┐
  │  exceptionally(ex -> fallback)    异常降级       │
  │  handle((r, ex) -> newR)          统一处理       │
  │  whenComplete((r, ex) -> {})      完成回调       │
  └─────────────────────────────────────────────────┘

  执行时间线示意（串行 vs 并行）：

  串行: fetchUser → fetchOrder → process
  ────[500ms]───────[300ms]─────[10ms]───▶ 总计 810ms

  并行: fetchUser(1)
        fetchUser(2)    同时执行
        fetchUser(3)
  ────[500ms]───▶ 总计 500ms (取最慢的)

  thenCompose vs thenApply:
  ┌─────────────────────────────────────────────────────┐
  │  thenApply:    CF<A> → (A → B)      → CF<B>        │
  │  thenCompose:  CF<A> → (A → CF<B>)  → CF<B>        │
  │                                                     │
  │  thenApply   = map    (同步转换)                     │
  │  thenCompose = flatMap (异步串行，避免 CF<CF<B>>)     │
  └─────────────────────────────────────────────────────┘
```

---

## 3. 小结

```
┌──────────────────────────────────────────────────────────────┐
│              线程池 & 异步编程 速查                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  线程池黄金法则:                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  1. 不要用 Executors 工厂（队列可能无界导致 OOM）       │  │
│  │  2. 手动用 ThreadPoolExecutor 设置 7 大参数             │  │
│  │  3. 给线程池命名（排查问题时能分清是哪个池）            │  │
│  │  4. 核心参数用压测确定，不要拍脑袋                      │  │
│  │  5. 一定要 shutdown + awaitTermination                 │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  CompletableFuture 选择指南:                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  多个独立任务并行 → allOf + join                     │    │
│  │  任务有依赖关系   → thenCompose 串行                 │    │
│  │  合并两个结果     → thenCombine                      │    │
│  │  错误降级         → exceptionally                    │    │
│  │  超时控制         → orTimeout (JDK 9+)               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**下一节：** [05 - 实战项目](05-practical-project.md) — 高并发订单处理系统
