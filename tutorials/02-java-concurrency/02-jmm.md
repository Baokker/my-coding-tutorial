# 02 - Java 内存模型 (JMM)

## 为什么需要 JMM？

```
现代 CPU 架构导致的问题：

  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │   CPU 0                                    CPU 1            │
  │   ┌──────────┐                            ┌──────────┐     │
  │   │ 寄存器    │                            │ 寄存器    │     │
  │   └────┬─────┘                            └────┬─────┘     │
  │        │                                       │           │
  │   ┌────▼─────┐                            ┌────▼─────┐     │
  │   │ L1 Cache │                            │ L1 Cache │     │
  │   └────┬─────┘                            └────┬─────┘     │
  │        │                                       │           │
  │   ┌────▼─────┐                            ┌────▼─────┐     │
  │   │ L2 Cache │                            │ L2 Cache │     │
  │   └────┬─────┘                            └────┬─────┘     │
  │        │                                       │           │
  │        └───────────────┬───────────────────────┘           │
  │                   ┌────▼─────┐                             │
  │                   │ L3 Cache │  (共享)                      │
  │                   └────┬─────┘                             │
  │                   ┌────▼─────┐                             │
  │                   │ 主内存    │                              │
  │                   └──────────┘                             │
  │                                                             │
  │  问题：每个 CPU 有自己的缓存，数据可能不一致！                  │
  │                                                             │
  │  线程A 在 CPU0 修改了 x=1                                    │
  │  线程B 在 CPU1 的缓存里看到的还是 x=0                         │
  │  → 这就是 "可见性" 问题                                      │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘
```

---

## 1. JMM 的三大核心问题

```
┌────────────────────────────────────────────────────────────────┐
│                    JMM 要解决三个问题                            │
├──────────────┬──────────────────┬──────────────────────────────┤
│   可见性      │    原子性         │     有序性                   │
│ Visibility   │  Atomicity       │    Ordering                 │
├──────────────┼──────────────────┼──────────────────────────────┤
│              │                  │                              │
│ 一个线程修改  │ 操作是否不可      │ 代码执行顺序是否              │
│ 的值，另一个  │ 分割（中间不      │ 和编写顺序一致                │
│ 线程能否立即  │ 会被打断）        │                              │
│ 看到          │                  │ 编译器和CPU可能               │
│              │ i++ 不是原子的!   │ 重排指令来优化                │
│              │ 读→改→写 三步     │                              │
├──────────────┼──────────────────┼──────────────────────────────┤
│              │                  │                              │
│ volatile     │ synchronized     │ volatile                     │
│ synchronized │ Lock             │ synchronized                 │
│ final        │ Atomic 类        │ happens-before 规则          │
│              │                  │                              │
└──────────────┴──────────────────┴──────────────────────────────┘
```

### 可见性问题演示

```java
public class VisibilityDemo {
    // 没有 volatile，线程 B 可能永远看不到变化!
    private static boolean running = true;

    public static void main(String[] args) throws InterruptedException {
        Thread worker = new Thread(() -> {
            int count = 0;
            while (running) {  // 可能被 JIT 优化成 while(true)!
                count++;
            }
            System.out.println("退出循环, count=" + count);
        });

        worker.start();
        Thread.sleep(1000);

        running = false;  // 修改了，但 worker 线程可能看不到!
        System.out.println("已设置 running = false");
        worker.join(3000);

        if (worker.isAlive()) {
            System.out.println("线程没有退出! (可见性问题)");
        }
    }
}
```

```
可见性问题的原因：

  线程 A (main)                         线程 B (worker)
  ┌──────────────┐                     ┌──────────────┐
  │ 主内存:       │                     │              │
  │ running=true │                     │ 本地缓存:     │
  └──────┬───────┘                     │ running=true │
         │                             └──────┬───────┘
         │                                    │
         │  main: running=false               │  while(running)
         │  写入主内存                         │  读本地缓存 → true
         │     ✓                              │  (不知道主内存变了!)
         ▼                                    │
  ┌──────────────┐                            │
  │ 主内存:       │          ✗ 不同步           │
  │ running=false│ ────────────────────────── │
  └──────────────┘                            ▼
                                        死循环!

  解决方法：加 volatile
  private static volatile boolean running = true;
  → 每次读都从主内存读，每次写都刷到主内存
```

---

## 2. volatile 关键字

```java
public class VolatileDemo {

    // volatile 保证: 可见性 + 有序性（禁止重排）
    // volatile 不保证: 原子性!
    private volatile boolean flag = false;
    private volatile int count = 0;

    // 典型用法一：状态标志
    public void stop() {
        flag = true;  // 对其他线程立即可见
    }

    public void run() {
        while (!flag) {
            // 工作...
        }
    }

    // 典型用法二：双重检查锁定 (DCL)
    private static volatile VolatileDemo instance;

    public static VolatileDemo getInstance() {
        if (instance == null) {               // 第一次检查（无锁）
            synchronized (VolatileDemo.class) {
                if (instance == null) {       // 第二次检查（有锁）
                    instance = new VolatileDemo();  // volatile 防止重排
                }
            }
        }
        return instance;
    }

    // ⚠️ volatile 的陷阱：count++ 不是原子的!
    public void unsafeIncrement() {
        count++;  // 虽然 count 是 volatile，但 ++ 不是原子操作
        // 正确做法: 用 AtomicInteger
    }
}
```

```
volatile 的内存语义：

  没有 volatile:                    有 volatile:
  ┌─────────┐    ┌─────────┐      ┌─────────┐    ┌─────────┐
  │ 线程 A   │    │ 线程 B   │      │ 线程 A   │    │ 线程 B   │
  │ 工作内存  │    │ 工作内存  │      │ 工作内存  │    │ 工作内存  │
  │ x = 1   │    │ x = 0   │      │ x = 1   │    │ x = ?   │
  └────┬────┘    └─────────┘      └────┬────┘    └────┬────┘
       │          可能不同步              │   强制刷新    │
       ▼                               ▼              ▼
  ┌──────────────────────┐        ┌──────────────────────┐
  │ 主内存: x = ?        │        │ 主内存: x = 1        │
  │ (可能还没刷新)        │        │ (写入后立即刷新)      │
  └──────────────────────┘        └──────────────────────┘

  volatile 写: 把工作内存的值刷到主内存
  volatile 读: 从主内存重新加载到工作内存

  DCL 中为什么需要 volatile？

  instance = new Singleton() 实际上分三步:
    ① 分配内存
    ② 初始化对象
    ③ 引用指向内存

  CPU 可能重排成 ①→③→②
  没有 volatile 时，另一个线程可能拿到未初始化的对象!

  ┌──────────────────────────────────────────┐
  │  volatile 总结:                           │
  │  ✓ 保证可见性（跨线程读写同步）            │
  │  ✓ 禁止指令重排序                         │
  │  ✗ 不保证原子性（count++ 仍然不安全）      │
  └──────────────────────────────────────────┘
```

---

## 3. happens-before 规则

```
happens-before 是 JMM 的核心概念：
如果操作 A happens-before 操作 B，那么 A 的结果对 B 可见

┌──────────────────────────────────────────────────────────────┐
│                  8 条 happens-before 规则                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 程序顺序规则:                                             │
│     同一个线程中，前面的操作 HB 后面的操作                      │
│     a = 1;  ──HB──▶  b = a;                                 │
│                                                              │
│  2. 锁规则:                                                  │
│     unlock ──HB──▶ 下一次 lock                               │
│     synchronized(lock) {         synchronized(lock) {        │
│       x = 1;                       // 能看到 x=1             │
│     } ──────────HB──────────▶    }                           │
│                                                              │
│  3. volatile 规则:                                           │
│     volatile 写 ──HB──▶ volatile 读                          │
│     volatile x = 1; ──HB──▶ int y = x;                      │
│                                                              │
│  4. 线程启动规则:                                             │
│     start() ──HB──▶ 新线程的每一个操作                         │
│                                                              │
│  5. 线程终止规则:                                             │
│     线程中的每个操作 ──HB──▶ join() 返回                       │
│                                                              │
│  6. 中断规则:                                                 │
│     interrupt() ──HB──▶ 被中断线程检测到中断                   │
│                                                              │
│  7. 终结器规则:                                               │
│     构造函数 ──HB──▶ finalize()                               │
│                                                              │
│  8. 传递性:                                                   │
│     如果 A ──HB──▶ B 且 B ──HB──▶ C                          │
│     那么 A ──HB──▶ C                                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘

  举例：利用传递性

  线程 A:                    线程 B:
  a = 1;          ───①───▶
  volatile x = true; ──②──▶ if (volatile x == true) {
                             ──③──▶  assert a == 1; // 一定成立!
                                   }

  ① a=1 HB volatile写 (程序顺序规则)
  ② volatile写 HB volatile读 (volatile规则)
  ③ 由传递性: a=1 HB assert，所以 a=1 对线程B可见
```

---

## 4. 指令重排序

```
编译器和 CPU 为了优化性能，可能改变指令执行顺序：

  你写的代码:            CPU 实际执行:
  ┌──────────────┐      ┌──────────────┐
  │ a = 1;       │      │ b = 2;       │  ← 被重排了!
  │ b = 2;       │  →   │ a = 1;       │
  │ x = a + b;   │      │ x = a + b;   │  ← 结果不变，所以合法
  └──────────────┘      └──────────────┘

  单线程下重排不影响结果，但多线程下可能出问题!

  经典案例 — 指令重排导致的 bug:

  // 线程 A                     // 线程 B
  context = loadContext();      while (!initialized) { }
  initialized = true;           useContext(context);
       ↑                              ↑
  如果重排成:                    线程B 看到 initialized=true
  initialized = true;           但 context 还没赋值!
  context = loadContext();       → 空指针异常!

  解决：
  private volatile boolean initialized = false;
  volatile 禁止重排 → context 一定在 initialized 之前完成
```

---

## 5. 小结

```
┌──────────────────────────────────────────────────────────────┐
│                      JMM 核心知识点                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  三大问题:                                                    │
│  ┌────────────┬───────────────┬─────────────────────┐        │
│  │  可见性     │  原子性        │  有序性              │        │
│  │ volatile   │ synchronized  │ volatile             │        │
│  │ synchro... │ Atomic*       │ happens-before       │        │
│  └────────────┴───────────────┴─────────────────────┘        │
│                                                              │
│  volatile:                                                    │
│  ├── 保证可见性 ✓                                             │
│  ├── 禁止重排序 ✓                                             │
│  └── 不保证原子性 ✗ (count++ 不安全)                           │
│                                                              │
│  happens-before: JMM 的理论基础                               │
│  └── 8条规则，决定了哪些操作的结果对其他线程可见                  │
│                                                              │
│  实践建议:                                                    │
│  ├── 状态标志位 → volatile                                    │
│  ├── 复合操作(i++) → Atomic* 或 synchronized                  │
│  ├── 多个变量一起保护 → synchronized 或 Lock                   │
│  └── 不可变对象 → final (天然线程安全)                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**下一节：** [03 - JUC 并发工具箱](03-juc-toolkit.md) — Lock、原子类、并发集合、同步工具
