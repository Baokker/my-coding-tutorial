# 05 - 实战：高并发订单处理系统

## 项目架构

```
┌────────────────────────────────────────────────────────────────┐
│                  高并发订单处理系统架构                           │
│                                                                │
│   模拟请求            限流               异步处理               │
│   ┌───────┐     ┌──────────┐     ┌───────────────────┐        │
│   │客户端  │────▶│ Semaphore│────▶│ BlockingQueue     │        │
│   │并发提交│     │ 限流器   │     │ 订单队列           │        │
│   │订单    │     └──────────┘     └────────┬──────────┘        │
│   └───────┘                               │                   │
│                                           ▼                   │
│                                  ┌─────────────────┐          │
│                                  │ ThreadPool       │          │
│                                  │ ┌─────┐┌─────┐  │          │
│                                  │ │ W0  ││ W1  │  │          │
│                                  │ ├─────┤├─────┤  │          │
│                                  │ │ W2  ││ W3  │  │          │
│                                  │ └─────┘└─────┘  │          │
│                                  └────────┬────────┘          │
│                                           │                   │
│                              ┌────────────┼────────────┐      │
│                              ▼            ▼            ▼      │
│                         ┌────────┐  ┌────────┐  ┌────────┐   │
│                         │库存扣减│  │支付处理│  │结果通知│   │
│                         │(CAS)  │  │(异步)  │  │(回调)  │   │
│                         └────────┘  └────────┘  └────────┘   │
│                                                               │
│   监控统计: AtomicLong + LongAdder                             │
└────────────────────────────────────────────────────────────────┘
```

---

## 完整代码

```java
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

// ===== 订单模型 =====
class Order {
    private final String orderId;
    private final String product;
    private final int quantity;
    private final long createTime;
    private volatile String status;  // volatile 保证可见性

    public Order(String orderId, String product, int quantity) {
        this.orderId = orderId;
        this.product = product;
        this.quantity = quantity;
        this.createTime = System.currentTimeMillis();
        this.status = "CREATED";
    }

    // getters, setters, toString 省略
    public String getOrderId() { return orderId; }
    public String getProduct() { return product; }
    public int getQuantity() { return quantity; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    @Override
    public String toString() {
        return String.format("Order{id=%s, product=%s, qty=%d, status=%s}",
            orderId, product, quantity, status);
    }
}

// ===== 库存管理（CAS 无锁操作）=====
class InventoryManager {
    private final ConcurrentHashMap<String, AtomicInteger> stock = new ConcurrentHashMap<>();

    public InventoryManager() {
        // 初始库存
        stock.put("iPhone", new AtomicInteger(100));
        stock.put("MacBook", new AtomicInteger(50));
        stock.put("AirPods", new AtomicInteger(200));
    }

    // 扣减库存（CAS 原子操作，线程安全且无锁）
    public boolean deductStock(String product, int quantity) {
        AtomicInteger current = stock.get(product);
        if (current == null) return false;

        while (true) {
            int existing = current.get();
            if (existing < quantity) {
                return false;  // 库存不足
            }
            // CAS: 如果当前值还是 existing，就减去 quantity
            if (current.compareAndSet(existing, existing - quantity)) {
                return true;  // 扣减成功
            }
            // CAS 失败说明被其他线程改了，自动重试
        }
    }

    public int getStock(String product) {
        AtomicInteger current = stock.get(product);
        return current != null ? current.get() : 0;
    }
}

// ===== 统计监控 =====
class OrderMetrics {
    private final LongAdder totalOrders = new LongAdder();
    private final LongAdder successOrders = new LongAdder();
    private final LongAdder failedOrders = new LongAdder();
    private final LongAdder totalProcessTimeMs = new LongAdder();
    private final AtomicLong maxProcessTimeMs = new AtomicLong(0);

    public void recordSuccess(long processTimeMs) {
        totalOrders.increment();
        successOrders.increment();
        totalProcessTimeMs.add(processTimeMs);
        maxProcessTimeMs.updateAndGet(old -> Math.max(old, processTimeMs));
    }

    public void recordFailure() {
        totalOrders.increment();
        failedOrders.increment();
    }

    public void printReport() {
        long total = totalOrders.sum();
        long success = successOrders.sum();
        long failed = failedOrders.sum();
        long avgMs = total > 0 ? totalProcessTimeMs.sum() / total : 0;

        System.out.println("\n╔══════════════════════════════════════╗");
        System.out.println("║          订单处理统计报告             ║");
        System.out.println("╠══════════════════════════════════════╣");
        System.out.printf("║  总订单数:    %6d                  ║%n", total);
        System.out.printf("║  成功:        %6d                  ║%n", success);
        System.out.printf("║  失败:        %6d                  ║%n", failed);
        System.out.printf("║  成功率:      %5.1f%%                  ║%n",
            total > 0 ? (double) success / total * 100 : 0);
        System.out.printf("║  平均耗时:    %4dms                  ║%n", avgMs);
        System.out.printf("║  最大耗时:    %4dms                  ║%n", maxProcessTimeMs.get());
        System.out.println("╚══════════════════════════════════════╝");
    }
}

// ===== 订单处理器（核心）=====
class OrderProcessor {
    private final ThreadPoolExecutor workerPool;
    private final BlockingQueue<Order> orderQueue;
    private final Semaphore rateLimiter;
    private final InventoryManager inventory;
    private final OrderMetrics metrics;
    private volatile boolean running = true;

    public OrderProcessor(int poolSize, int queueCapacity, int maxConcurrent) {
        this.orderQueue = new LinkedBlockingQueue<>(queueCapacity);
        this.rateLimiter = new Semaphore(maxConcurrent);
        this.inventory = new InventoryManager();
        this.metrics = new OrderMetrics();

        // 手动创建线程池（不用 Executors!）
        this.workerPool = new ThreadPoolExecutor(
            poolSize,
            poolSize * 2,
            60, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(queueCapacity),
            r -> {
                Thread t = new Thread(r);
                t.setName("order-worker-" + t.getId());
                t.setDaemon(true);
                return t;
            },
            new ThreadPoolExecutor.CallerRunsPolicy()
        );
    }

    // 提交订单（带限流）
    public CompletableFuture<String> submitOrder(Order order) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                // 限流：最多 maxConcurrent 个并发
                if (!rateLimiter.tryAcquire(3, TimeUnit.SECONDS)) {
                    metrics.recordFailure();
                    order.setStatus("REJECTED");
                    return "REJECTED: 系统繁忙";
                }

                try {
                    return processOrder(order);
                } finally {
                    rateLimiter.release();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return "ERROR: 被中断";
            }
        }, workerPool);
    }

    // 处理单个订单
    private String processOrder(Order order) {
        long start = System.currentTimeMillis();

        try {
            // 步骤1：扣减库存（CAS 无锁）
            order.setStatus("PROCESSING");
            if (!inventory.deductStock(order.getProduct(), order.getQuantity())) {
                order.setStatus("FAILED");
                metrics.recordFailure();
                return "FAILED: 库存不足";
            }

            // 步骤2：模拟支付处理
            Thread.sleep(ThreadLocalRandom.current().nextInt(10, 50));

            // 步骤3：完成
            order.setStatus("COMPLETED");
            long elapsed = System.currentTimeMillis() - start;
            metrics.recordSuccess(elapsed);

            return "SUCCESS: " + order.getOrderId();

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            order.setStatus("ERROR");
            metrics.recordFailure();
            return "ERROR: " + e.getMessage();
        }
    }

    public void shutdown() {
        running = false;
        workerPool.shutdown();
        try {
            workerPool.awaitTermination(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            workerPool.shutdownNow();
        }
    }

    public InventoryManager getInventory() { return inventory; }
    public OrderMetrics getMetrics() { return metrics; }
}

// ===== 主程序 =====
public class OrderSystem {
    public static void main(String[] args) throws Exception {
        // 创建订单处理器：4 核心线程，队列 1000，最多 20 并发
        OrderProcessor processor = new OrderProcessor(4, 1000, 20);

        String[] products = {"iPhone", "MacBook", "AirPods"};
        int totalOrders = 500;

        System.out.println("初始库存:");
        for (String p : products) {
            System.out.printf("  %s: %d%n", p, processor.getInventory().getStock(p));
        }

        System.out.printf("%n开始模拟 %d 个并发订单...%n%n", totalOrders);
        long start = System.currentTimeMillis();

        // 模拟大量并发订单
        List<CompletableFuture<String>> futures = new ArrayList<>();
        CountDownLatch latch = new CountDownLatch(totalOrders);

        for (int i = 0; i < totalOrders; i++) {
            String product = products[ThreadLocalRandom.current().nextInt(products.length)];
            int qty = ThreadLocalRandom.current().nextInt(1, 4);
            Order order = new Order("ORD-" + String.format("%05d", i), product, qty);

            CompletableFuture<String> future = processor.submitOrder(order)
                .whenComplete((result, ex) -> latch.countDown());
            futures.add(future);
        }

        // 等待所有订单处理完成
        latch.await(30, TimeUnit.SECONDS);
        long elapsed = System.currentTimeMillis() - start;

        System.out.printf("%n总耗时: %dms (QPS: %.0f)%n", elapsed,
            (double) totalOrders / elapsed * 1000);

        // 打印统计报告
        processor.getMetrics().printReport();

        System.out.println("\n剩余库存:");
        for (String p : products) {
            System.out.printf("  %s: %d%n", p, processor.getInventory().getStock(p));
        }

        processor.shutdown();
    }
}
```

---

## 知识点映射

```
┌──────────────────────────────────────────────────────────┐
│  本项目使用的 JUC 工具和并发知识:                           │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  JUC 工具              │ 用途                             │
│  ─────────────────────┼──────────────────────────        │
│  ThreadPoolExecutor   │ 核心线程池，处理订单               │
│  CompletableFuture    │ 异步提交和链式处理                 │
│  Semaphore            │ 限流（最大并发控制）               │
│  CountDownLatch       │ 等待所有订单处理完成               │
│  ConcurrentHashMap    │ 线程安全的库存存储                 │
│  AtomicInteger        │ CAS 无锁库存扣减                  │
│  LongAdder            │ 高性能统计计数                     │
│  AtomicLong           │ 记录最大处理时间                   │
│  BlockingQueue        │ 线程池的任务队列                   │
│  volatile             │ 订单状态可见性、停止标志            │
│  ThreadLocalRandom    │ 线程安全的随机数                   │
│                                                          │
│  设计模式:                                                │
│  ├── 生产者-消费者    (客户端 → 队列 → Worker)            │
│  ├── Worker Pool      (固定线程处理任务流)                │
│  └── 限流             (Semaphore 控制并发上限)            │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

**模块二完成！**

**下一个模块：** [模块三：高并发架构设计](../03-architecture/)
