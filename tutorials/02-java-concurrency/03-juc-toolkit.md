# 03 - JUC 并发工具箱

## JUC 包全景图

```
┌──────────────────────────────────────────────────────────────────┐
│                  java.util.concurrent 全景                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────────┐  ┌──────────────────────┐ │
│  │   锁        │  │   原子类         │  │   并发集合            │ │
│  │             │  │                 │  │                      │ │
│  │ ReentrantLock│ │ AtomicInteger   │  │ ConcurrentHashMap    │ │
│  │ ReadWrite..  │ │ AtomicLong      │  │ CopyOnWriteArrayList │ │
│  │ StampedLock  │ │ AtomicReference │  │ ConcurrentLinkedQueue│ │
│  │ Condition   │  │ LongAdder       │  │ BlockingQueue        │ │
│  └─────────────┘  └─────────────────┘  └──────────────────────┘ │
│                                                                  │
│  ┌─────────────────┐  ┌──────────────────────────────────────┐  │
│  │   同步工具        │  │   线程池 & 异步                      │  │
│  │                 │  │                                      │  │
│  │ CountDownLatch  │  │ ThreadPoolExecutor                   │  │
│  │ CyclicBarrier   │  │ ScheduledThreadPoolExecutor          │  │
│  │ Semaphore       │  │ CompletableFuture                    │  │
│  │ Phaser          │  │ ForkJoinPool                         │  │
│  └─────────────────┘  └──────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 1. ReentrantLock — synchronized 的增强版

```java
import java.util.concurrent.locks.ReentrantLock;
import java.util.concurrent.locks.Condition;

public class ReentrantLockDemo {
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition notFull = lock.newCondition();
    private final Condition notEmpty = lock.newCondition();
    private final int[] buffer = new int[10];
    private int count = 0;

    // 生产者
    public void produce(int item) throws InterruptedException {
        lock.lock();     // 显式加锁
        try {
            while (count == buffer.length) {
                notFull.await();  // 等待"不满"条件（类似 wait）
            }
            buffer[count++] = item;
            notEmpty.signal();    // 通知"不空"条件（类似 notify）
        } finally {
            lock.unlock();  // 必须在 finally 中解锁!
        }
    }

    // 消费者
    public int consume() throws InterruptedException {
        lock.lock();
        try {
            while (count == 0) {
                notEmpty.await();
            }
            int item = buffer[--count];
            notFull.signal();
            return item;
        } finally {
            lock.unlock();
        }
    }
}
```

```
ReentrantLock vs synchronized：

  ┌──────────────────────┬──────────────────────────────────┐
  │    synchronized      │       ReentrantLock               │
  ├──────────────────────┼──────────────────────────────────┤
  │  自动加锁/解锁        │  手动 lock()/unlock()            │
  │  不可中断等待         │  lockInterruptibly() 可中断       │
  │  不能超时             │  tryLock(timeout) 可超时          │
  │  不能条件等待         │  Condition 多条件队列              │
  │  非公平               │  可选公平锁 new R.L.(true)       │
  │  只能关联一个条件      │  可以创建多个 Condition           │
  │  不需要 try-finally  │  必须 try-finally 保证释放        │
  └──────────────────────┴──────────────────────────────────┘

  何时选择 ReentrantLock？
  ┌─────────────────────────────────────────────┐
  │  ✓ 需要 tryLock 尝试加锁（避免死锁）        │
  │  ✓ 需要 lockInterruptibly（可中断等待）      │
  │  ✓ 需要多个 Condition 条件变量               │
  │  ✓ 需要公平锁                               │
  │  ✗ 其他情况用 synchronized 即可（更简洁）     │
  └─────────────────────────────────────────────┘
```

---

## 2. Atomic 原子类 — 无锁并发

```java
import java.util.concurrent.atomic.*;

public class AtomicDemo {
    // CAS (Compare-And-Swap) 实现的无锁计数器
    private final AtomicInteger counter = new AtomicInteger(0);
    private final AtomicLong totalBytes = new AtomicLong(0);
    private final AtomicBoolean initialized = new AtomicBoolean(false);

    public void increment() {
        counter.incrementAndGet();  // 原子递增，线程安全
    }

    public void addBytes(long bytes) {
        totalBytes.addAndGet(bytes);
    }

    // 典型用法：确保只初始化一次
    public void initOnce() {
        if (initialized.compareAndSet(false, true)) {
            System.out.println("初始化（只执行一次）");
        }
    }

    // AtomicReference：原子引用
    private final AtomicReference<String> config = new AtomicReference<>("default");

    public void updateConfig(String expected, String newValue) {
        config.compareAndSet(expected, newValue);
    }
}
```

```
CAS (Compare-And-Swap) 原理：

  AtomicInteger.incrementAndGet():

  ┌────────────────────────────────────────────────────┐
  │  do {                                              │
  │      旧值 = 从内存读取当前值     // 比如 oldVal = 5 │
  │      新值 = 旧值 + 1            // newVal = 6      │
  │  } while (!CAS(旧值, 新值))     // 如果内存中还是 5  │
  │                                 // 就把它改成 6     │
  │                                 // 否则重试          │
  └────────────────────────────────────────────────────┘

  CAS 操作（CPU 指令级别的原子操作）：
  ┌──────────────────────────────────────────┐
  │  CAS(expected, newValue):                │
  │                                          │
  │  if (内存值 == expected) {                │
  │      内存值 = newValue;                   │
  │      return true;     ← 成功，继续        │
  │  } else {                                │
  │      return false;    ← 失败，被别人改了   │
  │  }                       → 重新读取再试   │
  │                                          │
  │  整个过程是 CPU 保证的原子操作!             │
  └──────────────────────────────────────────┘

  CAS vs synchronized：
  ┌────────────────────┬───────────────────────┐
  │   synchronized     │      CAS (Atomic)     │
  │                    │                       │
  │  悲观锁: 先加锁    │  乐观锁: 先做再验证   │
  │  有线程切换开销     │  无锁，自旋重试        │
  │  竞争激烈时较好     │  竞争少时性能极佳      │
  │  竞争少时有额外开销 │  竞争激烈时自旋浪费CPU │
  └────────────────────┴───────────────────────┘

  高竞争计数场景? 用 LongAdder（分段计数后合并）
  private final LongAdder adder = new LongAdder();
  adder.increment();
  long total = adder.sum();
```

---

## 3. 并发集合

```java
import java.util.concurrent.*;
import java.util.*;

public class ConcurrentCollectionDemo {

    // ===== ConcurrentHashMap =====
    // 线程安全的 HashMap，分段锁（JDK8+ 用 CAS + synchronized）
    ConcurrentHashMap<String, Integer> map = new ConcurrentHashMap<>();

    public void concurrentMapDemo() {
        map.put("a", 1);
        map.putIfAbsent("b", 2);  // 原子操作：不存在才 put

        // 原子计算（这是线程安全的！）
        map.compute("a", (key, val) -> val == null ? 1 : val + 1);

        // 原子合并
        map.merge("visits", 1, Integer::sum);  // visits += 1

        // 并行遍历（利用多核）
        map.forEach(2, (key, val) ->
            System.out.println(key + "=" + val));
    }

    // ===== BlockingQueue =====
    // 生产者-消费者的最佳选择！
    BlockingQueue<String> queue = new ArrayBlockingQueue<>(100);

    public void blockingQueueDemo() throws InterruptedException {
        // 生产者
        queue.put("task1");   // 队列满时阻塞
        queue.offer("task2", 5, TimeUnit.SECONDS);  // 等5秒

        // 消费者
        String task = queue.take();   // 队列空时阻塞
        String task2 = queue.poll(5, TimeUnit.SECONDS);  // 等5秒
    }

    // ===== CopyOnWriteArrayList =====
    // 读多写少场景（写时复制整个数组）
    CopyOnWriteArrayList<String> cowList = new CopyOnWriteArrayList<>();

    public void cowDemo() {
        cowList.add("item1");  // 写时复制整个底层数组
        // 读操作无需加锁，永远读到一致的快照
        for (String item : cowList) {  // 迭代安全
            System.out.println(item);
        }
    }
}
```

```
ConcurrentHashMap 演进：

  JDK 7: 分段锁 (Segment)
  ┌──────────────────────────────────────┐
  │  Segment[0]   Segment[1]   Seg[15]  │
  │  ┌──Lock──┐   ┌──Lock──┐            │
  │  │bucket  │   │bucket  │   ...      │
  │  │bucket  │   │bucket  │            │
  │  │bucket  │   │bucket  │            │
  │  └────────┘   └────────┘            │
  │  16 个段，每段独立加锁                │
  │  最多 16 个线程并发写                 │
  └──────────────────────────────────────┘

  JDK 8+: CAS + synchronized (锁单个桶)
  ┌──────────────────────────────────────┐
  │  [0]   [1]   [2]   [3]  ... [N-1]  │
  │   │     │     │     │               │
  │   ▼     ▼     ▼     ▼               │
  │  Node  Node  null  Node             │
  │   │           ↑     │               │
  │   ▼    CAS插入      ▼               │
  │  Node  空桶时用CAS  TreeNode         │
  │   │    有冲突用      (红黑树)         │
  │   ▼    synchronized                 │
  │  null                               │
  │                                     │
  │  每个桶独立加锁 → 并发度 = 桶数量     │
  └──────────────────────────────────────┘

  BlockingQueue 实现选择：
  ┌─────────────────────┬──────────────────────────────┐
  │  ArrayBlockingQueue │  有界，数组实现，公平可选       │
  │  LinkedBlockingQueue│  有界/无界，链表，吞吐量较高   │
  │  PriorityBlockingQ  │  无界，按优先级出队             │
  │  SynchronousQueue   │  无缓冲，直接传递（线程池用）   │
  │  DelayQueue         │  延迟出队（定时任务用）         │
  └─────────────────────┴──────────────────────────────┘
```

---

## 4. 同步工具类

### CountDownLatch — 等待一组操作完成

```java
import java.util.concurrent.CountDownLatch;

public class CountDownLatchDemo {
    public static void main(String[] args) throws InterruptedException {
        int taskCount = 5;
        CountDownLatch latch = new CountDownLatch(taskCount);

        for (int i = 0; i < taskCount; i++) {
            int taskId = i;
            new Thread(() -> {
                try {
                    Thread.sleep((long)(Math.random() * 1000));
                    System.out.println("任务 " + taskId + " 完成");
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    latch.countDown();  // 计数减1
                }
            }).start();
        }

        latch.await();  // 阻塞直到计数为0
        System.out.println("所有任务完成！开始汇总");
    }
}
```

### CyclicBarrier — 多线程到达屏障后一起继续

```java
import java.util.concurrent.CyclicBarrier;

public class CyclicBarrierDemo {
    public static void main(String[] args) {
        int parties = 3;

        // 所有线程到达屏障后执行的动作
        CyclicBarrier barrier = new CyclicBarrier(parties, () -> {
            System.out.println("=== 所有线程到达屏障 ===");
        });

        for (int i = 0; i < parties; i++) {
            int id = i;
            new Thread(() -> {
                try {
                    System.out.println("线程 " + id + " 第一阶段完成");
                    barrier.await();  // 等其他线程

                    System.out.println("线程 " + id + " 第二阶段完成");
                    barrier.await();  // 可以重复使用！
                } catch (Exception e) {
                    Thread.currentThread().interrupt();
                }
            }).start();
        }
    }
}
```

### Semaphore — 限制并发数

```java
import java.util.concurrent.Semaphore;

public class SemaphoreDemo {
    // 限制同时最多 3 个线程访问
    private final Semaphore semaphore = new Semaphore(3);

    public void accessResource(int threadId) {
        try {
            semaphore.acquire();  // 获取许可（没有则阻塞）
            System.out.println("线程 " + threadId + " 获取许可，开始工作");
            Thread.sleep(2000);   // 模拟工作
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            semaphore.release();  // 释放许可
            System.out.println("线程 " + threadId + " 释放许可");
        }
    }
}
```

```
三种同步工具对比：

  CountDownLatch (倒计时门闩):
  ┌─────────────────────────────────────┐
  │  线程A ──countDown()──┐              │
  │  线程B ──countDown()──┤──▶ await()   │
  │  线程C ──countDown()──┘    等待者继续 │
  │                                     │
  │  计数器 3 → 2 → 1 → 0 (一次性)      │
  │  典型场景: 主线程等所有子任务完成      │
  └─────────────────────────────────────┘

  CyclicBarrier (循环屏障):
  ┌─────────────────────────────────────┐
  │  线程A ──await()──┐                  │
  │  线程B ──await()──┼──▶ 全部到齐!     │
  │  线程C ──await()──┘    一起继续      │
  │                                     │
  │  到齐后自动重置（可循环使用）          │
  │  典型场景: 多线程分段并行计算         │
  └─────────────────────────────────────┘

  Semaphore (信号量):
  ┌─────────────────────────────────────┐
  │  permits = 3                        │
  │                                     │
  │  线程A ──acquire()── 进入 (剩2)      │
  │  线程B ──acquire()── 进入 (剩1)      │
  │  线程C ──acquire()── 进入 (剩0)      │
  │  线程D ──acquire()── 阻塞等待!       │
  │  线程A ──release()── 线程D 进入      │
  │                                     │
  │  典型场景: 数据库连接池、限流         │
  └─────────────────────────────────────┘
```

---

## 5. 小结

```
┌──────────────────────────────────────────────────────────┐
│                   JUC 工具箱速查                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  场景                  │ 推荐工具                         │
│  ─────────────────────┼──────────────────────────        │
│  简单互斥              │ synchronized                     │
│  需要 tryLock/公平锁   │ ReentrantLock                    │
│  读多写少的锁          │ ReadWriteLock / StampedLock       │
│  计数器/累加器         │ AtomicInteger / LongAdder         │
│  线程安全 Map          │ ConcurrentHashMap                 │
│  生产者-消费者         │ BlockingQueue                     │
│  读多写极少的列表      │ CopyOnWriteArrayList              │
│  等待一组任务完成      │ CountDownLatch                    │
│  多线程同步到同一点    │ CyclicBarrier                     │
│  限制并发数            │ Semaphore                         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**下一节：** [04 - 线程池与异步编程](04-threadpool.md)
