# 01 - Kafka 深入原理

## Kafka 存储架构

```
Topic → Partition → Segment → Log File

  Topic: order-events
  ├── Partition 0
  │   ├── Segment 0 (offset 0~999)
  │   │   ├── 00000000000000000000.log     ← 消息数据
  │   │   ├── 00000000000000000000.index   ← 偏移量索引
  │   │   └── 00000000000000000000.timeindex ← 时间索引
  │   ├── Segment 1 (offset 1000~1999)
  │   │   ├── 00000000000000001000.log
  │   │   └── ...
  │   └── ...
  ├── Partition 1
  └── Partition 2

  磁盘上的消息存储:
  ┌──────────────────────────────────────────────────────────┐
  │  .log 文件（顺序追加写入）                                │
  │                                                          │
  │  ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐    │
  │  │msg 0   ││msg 1   ││msg 2   ││msg 3   ││msg 4   │    │
  │  │offset=0││offset=1││offset=2││offset=3││offset=4│    │
  │  │key=u1  ││key=u2  ││key=u1  ││key=u3  ││key=u2  │    │
  │  │val=... ││val=... ││val=... ││val=... ││val=... │    │
  │  └────────┘└────────┘└────────┘└────────┘└────────┘    │
  │  ──────────────────────────────────────────▶ 时间        │
  │                                                          │
  │  Kafka 高性能的秘密:                                      │
  │  ┌──────────────────────────────────────────────────┐    │
  │  │  1. 顺序写磁盘（比随机写快 1000x）                │    │
  │  │  2. Page Cache（利用 OS 页缓存）                  │    │
  │  │  3. Zero-Copy（sendfile 零拷贝）                  │    │
  │  │  4. 批量压缩（多条消息一起压缩传输）                │    │
  │  └──────────────────────────────────────────────────┘    │
  └──────────────────────────────────────────────────────────┘
```

### 零拷贝（Zero-Copy）

```
传统读取发送:
  磁盘 → 内核缓冲区 → 用户缓冲区 → Socket缓冲区 → 网卡
                      ↑  2次拷贝   ↑
                      4次上下文切换

Zero-Copy (sendfile):
  磁盘 → 内核缓冲区 ────────────────→ 网卡
                    0次用户态拷贝
                    2次上下文切换

  这就是 Kafka 能达到百万级 TPS 的关键之一
```

---

## ISR 副本机制

```
┌──────────────────────────────────────────────────────────────┐
│  ISR (In-Sync Replicas) 同步副本集                           │
│                                                              │
│  Partition 0:                                                │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Broker 0     │  │ Broker 1     │  │ Broker 2     │      │
│  │ Replica 0    │  │ Replica 1    │  │ Replica 2    │      │
│  │ (Leader) ✓   │  │ (Follower) ✓ │  │ (Follower) ✓ │      │
│  │              │  │              │  │              │      │
│  │ offset: 100  │  │ offset: 99   │  │ offset: 98   │      │
│  └──────┬───────┘  └──────────────┘  └──────────────┘      │
│         │                                                    │
│         │  ISR = {0, 1, 2}  三个都在同步范围内                │
│         │                                                    │
│  生产者写入 → Leader → 同步给 ISR 中的 Follower             │
│                                                              │
│  acks 配置:                                                  │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  acks=0:  不等确认（最快，可能丢消息）                │    │
│  │  acks=1:  Leader 确认即可（平衡）                     │    │
│  │  acks=all: 所有 ISR 确认（最安全，较慢）              │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Leader 挂了怎么办?                                          │
│  ISR 中选一个 Follower 升级为新 Leader                       │
│  如果 ISR 为空 → 看配置是否允许非 ISR 副本当 Leader          │
│                  (unclean.leader.election.enable)            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Go Kafka 生产者/消费者实战

```go
package main

import (
    "context"
    "fmt"
    "log"
    "time"

    "github.com/segmentio/kafka-go"
)

// ===== 生产者 =====
func produce() {
    writer := &kafka.Writer{
        Addr:         kafka.TCP("localhost:9092"),
        Topic:        "order-events",
        Balancer:     &kafka.Hash{},      // 按 key hash 分区（保证同 key 有序）
        BatchSize:    100,                 // 批量发送
        BatchTimeout: 10 * time.Millisecond,
        RequiredAcks: kafka.RequireAll,    // acks=all 最安全
    }
    defer writer.Close()

    for i := 0; i < 10; i++ {
        err := writer.WriteMessages(context.Background(),
            kafka.Message{
                Key:   []byte(fmt.Sprintf("user-%d", i%3)),
                Value: []byte(fmt.Sprintf(`{"order_id":%d,"amount":%d}`, i, (i+1)*100)),
            },
        )
        if err != nil {
            log.Printf("发送失败: %v", err)
        } else {
            fmt.Printf("发送成功: order %d\n", i)
        }
    }
}

// ===== 消费者 =====
func consume() {
    reader := kafka.NewReader(kafka.ReaderConfig{
        Brokers:        []string{"localhost:9092"},
        Topic:          "order-events",
        GroupID:         "order-processor",    // 消费者组
        MinBytes:        1,
        MaxBytes:        10e6,
        CommitInterval:  time.Second,          // 自动提交 offset
        StartOffset:     kafka.FirstOffset,    // 从头消费
    })
    defer reader.Close()

    ctx := context.Background()
    for {
        msg, err := reader.ReadMessage(ctx)
        if err != nil {
            log.Printf("读取失败: %v", err)
            break
        }
        fmt.Printf("收到: partition=%d offset=%d key=%s value=%s\n",
            msg.Partition, msg.Offset, string(msg.Key), string(msg.Value))
    }
}

func main() {
    go produce()
    time.Sleep(2 * time.Second)
    consume()
}
```

---

## 小结

```
┌──────────────────────────────────────────────────────────┐
│  Kafka 核心要点                                           │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  高性能三板斧: 顺序写 + Page Cache + Zero-Copy           │
│  可靠性:      ISR 副本 + acks 配置                       │
│  有序性:      单 Partition 内有序，跨 Partition 无序     │
│  消费模型:    Consumer Group + Offset 提交               │
│                                                          │
│  适用场景:                                                │
│  ✓ 大数据流处理、日志收集、事件溯源                       │
│  ✓ 超高吞吐量（百万级 TPS）                              │
│  ✗ 不擅长延迟消息、事务消息（RocketMQ 更强）              │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**下一节：** [02 - RocketMQ](02-rocketmq.md)
