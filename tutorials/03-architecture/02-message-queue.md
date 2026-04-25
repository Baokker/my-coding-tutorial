# 02 - 消息队列

## MQ 在架构中的三大作用

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  1. 异步解耦                                                  │
│                                                              │
│  同步:  订单服务 → 库存 → 支付 → 通知 → 积分  (串行，很慢)    │
│         ──[50ms]──[30ms]──[200ms]──[100ms]── 总计 380ms      │
│                                                              │
│  异步:  订单服务 → MQ ← 库存服务                               │
│                      ← 支付服务                               │
│                      ← 通知服务   (并行，只要发MQ的时间)       │
│         ──[50ms]──[5ms] 总计 55ms                            │
│                                                              │
│  ┌──────┐     ┌─────┐     ┌──────┐                          │
│  │订单   │────▶│ MQ  │────▶│库存   │                          │
│  │服务   │     │     │────▶│支付   │  各服务独立消费           │
│  └──────┘     │     │────▶│通知   │  互不影响                │
│               └─────┘     └──────┘                          │
│                                                              │
│  2. 削峰填谷                                                  │
│                                                              │
│  请求量    ╱╲                                                 │
│          ╱  ╲       没有MQ: DB被峰值打爆                      │
│         ╱    ╲                                               │
│  ──────╱──────╲────────── 时间                               │
│                                                              │
│  请求量    ╱╲                                                 │
│          ╱  ╲       有MQ: 消息堆积在队列                      │
│  ───────╱────╲──  ← 消费者按自己的速度处理                    │
│        ╱      ╲     DB 压力平稳                               │
│  ─────╱────────╲──────── 时间                                │
│                                                              │
│  3. 最终一致性                                                │
│                                                              │
│  分布式事务太复杂 → 用 MQ 保证最终一致                         │
│  订单创建 → 发消息 → 库存服务消费 → 最终状态一致               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 1. Kafka 架构详解

```
┌───────────────────────────────────────────────────────────────┐
│                        Kafka 架构                             │
│                                                               │
│   Producer          Kafka Cluster             Consumer Group  │
│   ┌──────┐     ┌────────────────────┐        ┌──────────┐   │
│   │生产者 │────▶│  Broker 0          │───────▶│Consumer 0│   │
│   │      │     │  ┌──────────────┐  │        └──────────┘   │
│   └──────┘     │  │ Topic: order │  │        ┌──────────┐   │
│   ┌──────┐     │  │ Partition 0 ─┼──┼───────▶│Consumer 1│   │
│   │生产者 │────▶│  │ Partition 1 ─┼──┼────┐   └──────────┘   │
│   │      │     │  └──────────────┘  │    │   ┌──────────┐   │
│   └──────┘     └────────────────────┘    └──▶│Consumer 2│   │
│                ┌────────────────────┐        └──────────┘   │
│                │  Broker 1          │                        │
│                │  ┌──────────────┐  │                        │
│                │  │ Partition 2  │  │  每个 Partition         │
│                │  │ (Replica)   │  │  只被一个 Consumer 消费  │
│                │  └──────────────┘  │                        │
│                └────────────────────┘                        │
│                                                               │
└───────────────────────────────────────────────────────────────┘

  核心概念:
  ┌─────────────┬──────────────────────────────────────┐
  │  Topic       │ 消息的逻辑分类（如 order、payment）   │
  │  Partition   │ Topic 的物理分片，支持并行消费        │
  │  Broker      │ Kafka 服务器节点                     │
  │  Producer    │ 消息生产者                           │
  │  Consumer    │ 消息消费者                           │
  │  ConsumerGroup│ 消费者组，组内分摊消费               │
  │  Offset      │ 消费位置（每个Partition独立）         │
  │  Replica     │ 副本，保证数据可靠性                  │
  └─────────────┴──────────────────────────────────────┘
```

### Partition 与消费者的关系

```
  Topic: order (3 个 Partition)

  场景1: 3个消费者（最佳）
  ┌──────────┐     ┌────────────┐
  │ Part-0   │────▶│ Consumer-0 │
  │ Part-1   │────▶│ Consumer-1 │  每人负责一个分区
  │ Part-2   │────▶│ Consumer-2 │
  └──────────┘     └────────────┘

  场景2: 2个消费者
  ┌──────────┐     ┌────────────┐
  │ Part-0   │────▶│ Consumer-0 │  负责 2 个分区
  │ Part-1   │──┘  │            │
  │ Part-2   │────▶│ Consumer-1 │  负责 1 个分区
  └──────────┘     └────────────┘

  场景3: 4个消费者
  ┌──────────┐     ┌────────────┐
  │ Part-0   │────▶│ Consumer-0 │
  │ Part-1   │────▶│ Consumer-1 │
  │ Part-2   │────▶│ Consumer-2 │
  │          │     │ Consumer-3 │  空闲!（浪费）
  └──────────┘     └────────────┘

  ⚠️ 消费者数 > 分区数 → 多出来的消费者空闲
     所以分区数决定了最大并行度
```

### Go 生产者/消费者示例

```go
package main

import (
    "context"
    "fmt"
    "time"
)

// 用 channel 模拟 Kafka 的消息队列
type Message struct {
    Topic     string
    Key       string
    Value     string
    Timestamp time.Time
}

type SimpleQueue struct {
    ch chan Message
}

func NewQueue(bufferSize int) *SimpleQueue {
    return &SimpleQueue{ch: make(chan Message, bufferSize)}
}

// 生产者
func (q *SimpleQueue) Produce(ctx context.Context, msg Message) error {
    select {
    case q.ch <- msg:
        return nil
    case <-ctx.Done():
        return ctx.Err()
    }
}

// 消费者
func (q *SimpleQueue) Consume(ctx context.Context, handler func(Message)) {
    for {
        select {
        case msg := <-q.ch:
            handler(msg)
        case <-ctx.Done():
            fmt.Println("消费者退出")
            return
        }
    }
}

func main() {
    queue := NewQueue(100)
    ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
    defer cancel()

    // 启动 3 个消费者
    for i := 0; i < 3; i++ {
        id := i
        go queue.Consume(ctx, func(msg Message) {
            fmt.Printf("Consumer-%d: %s = %s\n", id, msg.Key, msg.Value)
        })
    }

    // 生产消息
    for i := 0; i < 10; i++ {
        queue.Produce(ctx, Message{
            Topic: "order",
            Key:   fmt.Sprintf("order-%d", i),
            Value: fmt.Sprintf("amount=%d", (i+1)*100),
        })
    }

    <-ctx.Done()
}
```

---

## 2. MQ 常见问题

```
┌────────────────────────────────────────────────────────────┐
│  问题              │ 解决方案                               │
├────────────────────┼───────────────────────────────────────┤
│                    │                                       │
│  消息丢失          │ 生产者: 同步发送 + ack                 │
│                    │ Broker: 多副本 + 刷盘策略              │
│                    │ 消费者: 手动 commit offset             │
│                    │                                       │
│  消息重复          │ 消费端幂等:                             │
│                    │ ① 数据库唯一索引                       │
│                    │ ② Redis 去重 (SETNX)                  │
│                    │ ③ 业务状态机（已处理就跳过）             │
│                    │                                       │
│  消息顺序          │ 同一个 key 发到同一个 Partition         │
│                    │ 单 Partition 内有序                     │
│                    │ 全局有序 → 只用 1 个 Partition(牺牲性能)│
│                    │                                       │
│  消息堆积          │ ① 增加消费者数量                        │
│                    │ ② 消费者内部多线程处理                   │
│                    │ ③ 紧急时跳过处理 + 事后补偿              │
│                    │                                       │
└────────────────────┴───────────────────────────────────────┘
```

**下一节：** [03 - 限流熔断](03-rate-limiting.md)
