# 01 - 向量数据库原理与 Milvus 架构

## 为什么需要向量数据库？

```
传统数据库 vs 向量数据库：

  传统数据库 (MySQL/PostgreSQL):
  ┌──────────────────────────────────────────┐
  │  SELECT * FROM products                  │
  │  WHERE name LIKE '%手机%'                │
  │  → 关键词精确匹配（"手机壳" 搜不到 "phone case"）│
  └──────────────────────────────────────────┘

  向量数据库 (Milvus/Pinecone):
  ┌──────────────────────────────────────────┐
  │  search(embedding("手机壳"), top_k=5)    │
  │  → 语义相似度搜索                        │
  │  → 能找到 "phone case", "保护套", "外壳" │
  └──────────────────────────────────────────┘

  核心区别:
  ┌──────────────┬──────────────────┬──────────────────┐
  │              │ 传统数据库        │ 向量数据库        │
  ├──────────────┼──────────────────┼──────────────────┤
  │ 数据类型     │ 结构化（行列）    │ 高维向量           │
  │ 查询方式     │ SQL 精确匹配      │ 近似最近邻(ANN)   │
  │ 索引         │ B+ 树 / Hash     │ HNSW / IVF / ...│
  │ 适用场景     │ 事务/报表         │ 语义搜索/推荐/RAG │
  └──────────────┴──────────────────┴──────────────────┘
```

---

## 1. 向量索引算法

```
暴力搜索 (Brute Force):
  每个查询都和所有向量计算相似度
  → 100% 精确，但 O(N) 复杂度，数据量大时太慢

  优化方向: 牺牲一点精确度，换取巨大的速度提升
  → 近似最近邻 (ANN) 算法


  ┌──────────────────────────────────────────────────────────┐
  │                 主流 ANN 索引算法                          │
  ├──────────────────────────────────────────────────────────┤
  │                                                          │
  │  1. IVF (Inverted File Index) — 倒排聚类                  │
  │                                                          │
  │     训练阶段: 把向量聚类成 N 个簇                          │
  │     ┌─────────────────────────────────┐                  │
  │     │     ●●●        ○○○              │                  │
  │     │    ●●●●       ○○○○    ▲▲▲       │                  │
  │     │     ●●         ○○    ▲▲▲▲       │                  │
  │     │               ○      ▲▲         │                  │
  │     │  Cluster 1   Cluster 2  Cluster 3│                  │
  │     └─────────────────────────────────┘                  │
  │                                                          │
  │     查询: 先找最近的几个簇 → 只在这些簇内搜索              │
  │     → 搜索范围从 N 缩小到 N/nlist × nprobe              │
  │                                                          │
  │  2. HNSW (Hierarchical Navigable Small World) — 分层图    │
  │                                                          │
  │     Layer 2:    A ────────── D       (稀疏，跳远)         │
  │                                                          │
  │     Layer 1:    A ── B ──── D ── E   (中等)              │
  │                                                          │
  │     Layer 0:    A─B─C─D─E─F─G─H─I   (稠密，精确)        │
  │                                                          │
  │     查询: 从最高层开始粗找 → 逐层细化 → 底层精确           │
  │     类似: 跳表 (Skip List) 的多维版本                      │
  │                                                          │
  │     特点: 查询快，但内存占用大                              │
  │                                                          │
  │  3. FLAT — 暴力搜索（小数据集用，100% 精确）               │
  │                                                          │
  │  选择建议:                                                │
  │  ┌────────────────────────────────────────────────────┐  │
  │  │  < 100万 向量:  HNSW（速度快，内存够用）            │  │
  │  │  100万~1亿:    IVF_SQ8 / IVF_PQ（省内存）          │  │
  │  │  > 1亿:       DiskANN / IVF_PQ（磁盘索引）         │  │
  │  │  需要100%精确: FLAT（小数据集或精排阶段）            │  │
  │  └────────────────────────────────────────────────────┘  │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

---

## 2. Milvus 架构

```
┌──────────────────────────────────────────────────────────────────┐
│                     Milvus 2.x 云原生架构                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Access Layer (接入层)                                     │  │
│  │  ┌──────────┐                                              │  │
│  │  │  Proxy   │  接收请求、鉴权、路由                        │  │
│  │  │  (无状态) │  可水平扩展                                  │  │
│  │  └──────────┘                                              │  │
│  └────────────────────────┬───────────────────────────────────┘  │
│                           │                                      │
│  ┌────────────────────────▼───────────────────────────────────┐  │
│  │  Coordinator (协调层)                                      │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │  │
│  │  │Root Coord│ │Data Coord│ │Query Coord││Index Coord│     │  │
│  │  │ 元数据    │ │ 数据分配  │ │ 查询调度  │ │ 索引管理  │     │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘     │  │
│  └────────────────────────┬───────────────────────────────────┘  │
│                           │                                      │
│  ┌────────────────────────▼───────────────────────────────────┐  │
│  │  Worker (执行层)                                           │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                   │  │
│  │  │Data Node │ │Query Node│ │Index Node│                   │  │
│  │  │ 写入数据  │ │ 执行搜索  │ │ 构建索引  │                   │  │
│  │  │ 持久化    │ │ 加载向量  │ │          │                   │  │
│  │  └──────────┘ └──────────┘ └──────────┘                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                           │                                      │
│  ┌────────────────────────▼───────────────────────────────────┐  │
│  │  Storage (存储层)                                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐│  │
│  │  │ etcd         │  │ MinIO/S3     │  │ Pulsar/Kafka     ││  │
│  │  │ 元数据存储    │  │ 向量数据存储  │  │ 日志/WAL 流      ││  │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘│  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  计算存储分离: 各层独立扩展                                       │
│  Query Node 不够? 加 Query Node (不影响其他组件)                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Go 使用 Milvus SDK

```go
package main

import (
    "context"
    "fmt"
    "log"

    "github.com/milvus-io/milvus-sdk-go/v2/client"
    "github.com/milvus-io/milvus-sdk-go/v2/entity"
)

func main() {
    ctx := context.Background()

    // 1. 连接 Milvus
    c, err := client.NewClient(ctx, client.Config{
        Address: "localhost:19530",
    })
    if err != nil {
        log.Fatal(err)
    }
    defer c.Close()

    collName := "documents"

    // 2. 创建 Collection（类似表）
    schema := entity.NewSchema().
        WithName(collName).
        WithField(entity.NewField().
            WithName("id").
            WithDataType(entity.FieldTypeInt64).
            WithIsPrimaryKey(true).
            WithIsAutoID(true)).
        WithField(entity.NewField().
            WithName("text").
            WithDataType(entity.FieldTypeVarChar).
            WithMaxLength(1024)).
        WithField(entity.NewField().
            WithName("embedding").
            WithDataType(entity.FieldTypeFloatVector).
            WithDim(128))  // 128维向量

    err = c.CreateCollection(ctx, schema, entity.DefaultShardNumber)
    if err != nil {
        log.Fatal(err)
    }

    // 3. 插入数据
    texts := []string{"退款政策", "配送说明", "会员权益"}
    embeddings := make([][]float32, 3)
    for i := range embeddings {
        embeddings[i] = make([]float32, 128)
        for j := range embeddings[i] {
            embeddings[i][j] = float32(i*10+j) * 0.01 // 模拟向量
        }
    }

    _, err = c.Insert(ctx, collName, "",
        entity.NewColumnVarChar("text", texts),
        entity.NewColumnFloatVector("embedding", 128, embeddings),
    )
    if err != nil {
        log.Fatal(err)
    }

    // 4. 创建索引
    idx, _ := entity.NewIndexHNSW(entity.L2, 16, 256)
    err = c.CreateIndex(ctx, collName, "embedding", idx, false)
    if err != nil {
        log.Fatal(err)
    }

    // 5. 加载到内存
    err = c.LoadCollection(ctx, collName, false)
    if err != nil {
        log.Fatal(err)
    }

    // 6. 搜索
    queryVec := make([]float32, 128)
    for i := range queryVec {
        queryVec[i] = float32(i) * 0.01
    }

    sp, _ := entity.NewIndexHNSWSearchParam(64)
    results, err := c.Search(ctx, collName,
        nil,
        "",
        []string{"text"},  // 返回字段
        []entity.Vector{entity.FloatVector(queryVec)},
        "embedding",       // 搜索字段
        entity.L2,         // 距离度量
        3,                 // top_k
        sp,
    )
    if err != nil {
        log.Fatal(err)
    }

    for _, result := range results {
        for i := 0; i < result.ResultCount; i++ {
            text, _ := result.Fields.GetColumn("text").GetAsString(i)
            fmt.Printf("Score: %.4f, Text: %s\n", result.Scores[i], text)
        }
    }
}
```

```
Milvus 操作流程:

  ① CreateCollection (定义 Schema)
       │
       ▼
  ② Insert (插入向量 + 元数据)
       │
       ▼
  ③ CreateIndex (建 HNSW/IVF 索引)
       │
       ▼
  ④ LoadCollection (加载到内存)
       │
       ▼
  ⑤ Search (向量相似度搜索)

  核心概念:
  ┌────────────────────────────────────────────────────┐
  │  Collection = 表                                   │
  │  Field      = 列（必须有主键 + 至少一个向量字段）   │
  │  Index      = 向量索引（HNSW/IVF/FLAT）            │
  │  Partition  = 分区（可按类别分区加速搜索）           │
  │  Segment    = 内部存储单元                          │
  └────────────────────────────────────────────────────┘
```

---

## 4. 小结

```
┌──────────────────────────────────────────────────────────┐
│  向量数据库 / Milvus 速查                                 │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  索引选择:                                                │
│  ├── FLAT:  小数据集，100%精确                           │
│  ├── HNSW:  通用首选，速度快，内存占用大                  │
│  ├── IVF_FLAT: 平衡速度和精度                            │
│  └── IVF_PQ:  超大数据集，省内存                         │
│                                                          │
│  距离度量:                                                │
│  ├── L2 (欧氏距离):  数值越小越相似                      │
│  ├── IP (内积):      数值越大越相似                      │
│  └── Cosine (余弦):  方向相似度，最常用                   │
│                                                          │
│  Milvus 特点:                                            │
│  ├── 云原生，计算存储分离                                 │
│  ├── 支持十亿级向量                                      │
│  ├── 支持标量过滤（向量搜索 + WHERE 条件）               │
│  └── 开源 (Apache 2.0)                                  │
│                                                          │
│  RAG 中的角色:                                            │
│  Embedding → 存入 Milvus → 查询时检索 Top-K → 喂给 LLM  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**模块十一完成！**
