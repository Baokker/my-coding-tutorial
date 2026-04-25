# 02 - 复合类型：数组、切片、Map、结构体

## 复合类型全景图

```
┌─────────────────────────────────────────────────────────────┐
│                    Go 复合类型                               │
├──────────────┬──────────────┬──────────┬────────────────────┤
│   数组        │   切片        │   Map    │   结构体           │
│   Array      │   Slice      │          │   Struct          │
│              │              │          │                   │
│  [5]int      │  []int       │  map     │  type Foo struct  │
│  固定长度     │  动态长度     │ [K]V     │  { ... }          │
│  值类型       │  引用语义     │ 引用语义  │  值类型            │
│  很少直接用   │  最常用!      │ 常用     │  核心构建块         │
└──────────────┴──────────────┴──────────┴────────────────────┘
```

---

## 1. 数组（Array）

```go
package main

import "fmt"

func main() {
    // 数组：固定长度，声明时就确定大小
    var arr1 [5]int                      // [0 0 0 0 0]
    arr2 := [3]string{"Go", "Java", "Python"}
    arr3 := [...]int{10, 20, 30, 40}    // ... 让编译器数个数

    fmt.Println(arr1)  // [0 0 0 0 0]
    fmt.Println(arr2)  // [Go Java Python]
    fmt.Println(arr3)  // [10 20 30 40]
    fmt.Println(len(arr3))  // 4

    // 注意：[3]int 和 [5]int 是不同类型！不能互相赋值
    // 数组是值类型，赋值和传参会完整拷贝
}
```

```
数组在 Go 中很少直接使用，因为：

  ┌──────────────────────────────────────┐
  │  1. 长度是类型的一部分                 │
  │     [3]int ≠ [5]int（不同类型！）      │
  │                                      │
  │  2. 赋值和传参都是完整拷贝             │
  │     func foo(arr [1000]int) ← 拷贝!  │
  │                                      │
  │  3. 实际开发中 99% 用切片(Slice)       │
  └──────────────────────────────────────┘
```

---

## 2. 切片（Slice）— Go 中最重要的数据结构之一

### 2.1 切片的内存结构

```
切片(Slice) = 指向底层数组的 "窗口"

  切片变量 s:
  ┌──────────────────────┐
  │  ptr  ──────────┐    │
  │  len = 3        │    │
  │  cap = 5        │    │
  └─────────────────┼────┘
                    │
                    ▼
  底层数组:  ┌───┬───┬───┬───┬───┐
            │ 1 │ 2 │ 3 │   │   │
            └───┴───┴───┴───┴───┘
            index: 0   1   2   3   4
                   ◀── len ──▶
                   ◀────── cap ──────▶

  len(s) = 3  （当前元素个数）
  cap(s) = 5  （底层数组从 ptr 开始到末尾的容量）
```

### 2.2 创建与操作

```go
package main

import "fmt"

func main() {
    // 方式一：从字面量创建
    s1 := []int{1, 2, 3, 4, 5}

    // 方式二：make 创建（指定 len 和 cap）
    s2 := make([]int, 3, 10)  // len=3, cap=10
    fmt.Println(s2)           // [0 0 0]

    // 方式三：从数组切出来
    arr := [5]int{10, 20, 30, 40, 50}
    s3 := arr[1:4]  // [20 30 40]，左闭右开

    fmt.Println(s1, s3)

    // append：追加元素（最常用的操作）
    s := []int{1, 2, 3}
    s = append(s, 4)          // [1 2 3 4]
    s = append(s, 5, 6, 7)   // [1 2 3 4 5 6 7]

    // 合并两个切片
    other := []int{8, 9}
    s = append(s, other...)   // ... 展开切片
    fmt.Println(s)
}
```

### 2.3 切片的扩容机制

```
append 触发扩容的过程：

  初始状态: len=3, cap=4
  ┌───┬───┬───┬───┐
  │ 1 │ 2 │ 3 │   │   ← 还有 1 个位置
  └───┴───┴───┴───┘

  append(s, 4):   len=4, cap=4  （刚好放下）
  ┌───┬───┬───┬───┐
  │ 1 │ 2 │ 3 │ 4 │   ← 满了！
  └───┴───┴───┴───┘

  append(s, 5):   容量不够 → 触发扩容！
  ┌───┬───┬───┬───┬───┬───┬───┬───┐
  │ 1 │ 2 │ 3 │ 4 │ 5 │   │   │   │  ← 新数组 cap=8
  └───┴───┴───┴───┴───┴───┴───┴───┘
  原数组被 GC 回收

  扩容策略（Go 1.18+）：
  ┌─────────────────────────────────────────┐
  │  cap < 256:   新容量 = 旧容量 × 2        │
  │  cap >= 256:  新容量 = 旧容量 × 1.25 + 192│
  └─────────────────────────────────────────┘

  ⚠️ 性能提示：如果预先知道容量，用 make([]T, 0, n)
     可以避免多次扩容带来的内存分配和拷贝开销
```

### 2.4 切片的陷阱

```go
package main

import "fmt"

func main() {
    // 陷阱一：切片共享底层数组
    original := []int{1, 2, 3, 4, 5}
    sub := original[1:3]  // [2 3]
    sub[0] = 999
    fmt.Println(original) // [1 999 3 4 5]  ← 原始切片也被改了！

    // 安全做法：用 copy 创建独立副本
    src := []int{1, 2, 3}
    dst := make([]int, len(src))
    copy(dst, src)
    dst[0] = 999
    fmt.Println(src)  // [1 2 3]  ← 不受影响

    // 陷阱二：nil 切片 vs 空切片
    var s1 []int           // nil 切片
    s2 := []int{}          // 空切片
    s3 := make([]int, 0)   // 空切片
    fmt.Println(s1 == nil) // true
    fmt.Println(s2 == nil) // false
    fmt.Println(len(s1), len(s2), len(s3)) // 0 0 0
    // 但 append 对两者都能正常工作！
}
```

```
切片共享底层数组的示意：

  original: ┌───┬─────┬───┬───┬───┐
            │ 1 │  2  │ 3 │ 4 │ 5 │
            └───┴──▲──┴───┴───┴───┘
                   │
  sub = original[1:3]
                   │
  sub:      ┌──────┤
            │ ptr ─┘
            │ len = 2
            │ cap = 4
            └──────────

  sub 和 original 指向同一块内存！修改一个影响另一个。

  copy 之后：
  original: ┌───┬───┬───┬───┬───┐
            │ 1 │ 2 │ 3 │ 4 │ 5 │  ← 内存区域 A
            └───┴───┴───┴───┴───┘

  dst:      ┌───┬───┬───┐
            │ 1 │ 2 │ 3 │              ← 内存区域 B（独立）
            └───┴───┴───┘
```

---

## 3. Map（映射 / 字典）

### 3.1 基本用法

```go
package main

import "fmt"

func main() {
    // 创建方式一：字面量
    scores := map[string]int{
        "Alice": 95,
        "Bob":   87,
        "Carol": 92,
    }

    // 创建方式二：make
    ages := make(map[string]int)
    ages["Alice"] = 30
    ages["Bob"] = 25

    // 读取
    fmt.Println(scores["Alice"])  // 95

    // 读取不存在的 key 返回零值（不会 panic）
    fmt.Println(scores["Dave"])   // 0

    // 判断 key 是否存在（comma ok 模式）
    val, ok := scores["Dave"]
    if ok {
        fmt.Println("Dave:", val)
    } else {
        fmt.Println("Dave 不存在")
    }

    // 删除
    delete(scores, "Bob")

    // 遍历（注意：顺序是随机的！）
    for name, score := range scores {
        fmt.Printf("%s: %d\n", name, score)
    }

    fmt.Println("人数:", len(scores))
}
```

```
Map 内部结构简化示意：

  m := map[string]int{"a": 1, "b": 2, "c": 3}

  ┌──────────────────────────────────────────┐
  │  Map Header                              │
  │  ┌──────────────┐                        │
  │  │ count: 3     │                        │
  │  │ buckets ─────┼──┐                     │
  │  └──────────────┘  │                     │
  │                    ▼                     │
  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
  │  │bucket 0 │  │bucket 1 │  │bucket 2 │  │
  │  │ "a": 1  │  │ "b": 2  │  │ "c": 3  │  │
  │  │         │  │         │  │         │  │
  │  └─────────┘  └─────────┘  └─────────┘  │
  └──────────────────────────────────────────┘

  key 通过 hash 函数分配到不同的 bucket
  Map 是引用类型：传递给函数时不会拷贝数据

  ⚠️ Map 不是并发安全的！多个 goroutine 同时读写会 panic
     → 并发场景用 sync.Map 或加 sync.RWMutex
```

---

## 4. 结构体（Struct）

### 4.1 定义和使用

```go
package main

import "fmt"

// 定义结构体
type User struct {
    Name  string
    Email string
    Age   int
}

// 定义带嵌套的结构体
type Address struct {
    City    string
    Country string
}

type Employee struct {
    User           // 嵌入（类似 Java 的继承，但更灵活）
    Address        // 可以嵌入多个
    Department string
    Salary     float64
}

func main() {
    // 创建方式一：按字段名（推荐）
    u1 := User{
        Name:  "Alice",
        Email: "alice@example.com",
        Age:   30,
    }

    // 创建方式二：按顺序（不推荐，加字段会出 bug）
    u2 := User{"Bob", "bob@example.com", 25}

    // 创建方式三：零值 + 逐个赋值
    var u3 User
    u3.Name = "Carol"
    u3.Age = 28

    fmt.Println(u1, u2, u3)

    // 嵌入结构体的使用
    emp := Employee{
        User:       User{Name: "Dave", Email: "dave@co.com", Age: 35},
        Address:    Address{City: "Beijing", Country: "China"},
        Department: "Engineering",
        Salary:     50000,
    }

    // 可以直接访问嵌入字段（像 Java 继承一样）
    fmt.Println(emp.Name)     // "Dave"（等价于 emp.User.Name）
    fmt.Println(emp.City)     // "Beijing"
    fmt.Println(emp.Salary)   // 50000
}
```

```
Go 的结构体嵌入 vs Java 的继承：

  Java 继承:                          Go 嵌入:
  ┌──────────────┐                   ┌──────────────────┐
  │   Animal     │                   │    Employee       │
  │  - name      │                   │  ┌─────────────┐ │
  │  - age       │                   │  │  User       │ │
  └──────┬───────┘                   │  │  - Name     │ │
         │ extends                   │  │  - Email    │ │
  ┌──────┴───────┐                   │  │  - Age      │ │
  │     Dog      │                   │  └─────────────┘ │
  │  - breed     │                   │  ┌─────────────┐ │
  └──────────────┘                   │  │  Address    │ │
                                     │  │  - City     │ │
  单继承，is-a 关系                    │  └─────────────┘ │
  Dog IS an Animal                   │  - Department    │
                                     │  - Salary        │
                                     └──────────────────┘

                                     组合，has-a 关系
                                     Employee HAS a User
                                     可以嵌入多个！（Java 不行）

  Go 格言："组合优于继承"
```

### 4.2 结构体方法

```go
package main

import (
    "fmt"
    "math"
)

type Circle struct {
    Radius float64
}

// 值接收者：不会修改原结构体（方法内是拷贝）
func (c Circle) Area() float64 {
    return math.Pi * c.Radius * c.Radius
}

// 指针接收者：可以修改原结构体
func (c *Circle) Scale(factor float64) {
    c.Radius *= factor
}

func main() {
    c := Circle{Radius: 5}
    fmt.Printf("面积: %.2f\n", c.Area())  // 78.54

    c.Scale(2)
    fmt.Printf("放大后面积: %.2f\n", c.Area()) // 314.16
}
```

```
值接收者 vs 指针接收者：

  值接收者 func (c Circle):         指针接收者 func (c *Circle):

  调用时：                           调用时：
  ┌──────────┐  拷贝  ┌──────────┐  ┌──────────┐  传地址  ┌────────┐
  │ c={R:5}  │ ────▶ │ c={R:5}  │  │ c={R:5}  │ ─────▶ │ c=&原c │
  └──────────┘       └──────────┘  └──────────┘         └───┬────┘
  原始不变             修改此拷贝     原始可能被改             │
                                                    ┌──────┘
                                                    ▼
                                              修改原始数据

  选择建议：
  ┌─────────────────────────────────────────────────┐
  │  用指针接收者 *T 的情况：                          │
  │  ✓ 需要修改接收者                                │
  │  ✓ 结构体很大（避免拷贝）                         │
  │  ✓ 一致性（如果有一个方法用指针，全都用指针）       │
  │                                                 │
  │  用值接收者 T 的情况：                             │
  │  ✓ 结构体很小（如 Point{X, Y int}）              │
  │  ✓ 不需要修改，且想保证不可变                      │
  └─────────────────────────────────────────────────┘
```

### 4.3 构造函数模式

```go
package main

import "fmt"

type Server struct {
    Host    string
    Port    int
    MaxConn int
    TLS     bool
}

// Go 没有构造函数关键字，用 NewXxx 函数代替
func NewServer(host string, port int) *Server {
    return &Server{
        Host:    host,
        Port:    port,
        MaxConn: 100,   // 默认值
        TLS:     false,
    }
}

// 函数选项模式（更灵活的构造方式）
type Option func(*Server)

func WithMaxConn(n int) Option {
    return func(s *Server) { s.MaxConn = n }
}

func WithTLS(enabled bool) Option {
    return func(s *Server) { s.TLS = enabled }
}

func NewServerWithOptions(host string, port int, opts ...Option) *Server {
    s := &Server{Host: host, Port: port, MaxConn: 100}
    for _, opt := range opts {
        opt(s)
    }
    return s
}

func main() {
    // 简单创建
    s1 := NewServer("localhost", 8080)

    // 带选项创建
    s2 := NewServerWithOptions("api.example.com", 443,
        WithMaxConn(1000),
        WithTLS(true),
    )

    fmt.Printf("s1: %+v\n", s1)
    fmt.Printf("s2: %+v\n", s2)
}
```

```
函数选项模式 (Functional Options Pattern):

  这是 Go 社区非常流行的设计模式，很多知名库都在用

  传统方式的问题：
    NewServer("host", 8080, 100, true, false, "")
    //                       ↑     ↑     ↑     ↑
    //                     啥意思？？？

  函数选项模式：
    NewServer("host", 8080,
        WithMaxConn(100),      ← 一看就知道什么意思
        WithTLS(true),
    )

  ┌──────────────────────────────────────────┐
  │  Option = func(*Server)                  │
  │                                          │
  │  WithMaxConn(n) ─▶ 返回一个修改 MaxConn  │
  │                     的函数               │
  │  WithTLS(b)     ─▶ 返回一个修改 TLS      │
  │                     的函数               │
  │                                          │
  │  构造时依次调用这些函数来配置 Server        │
  └──────────────────────────────────────────┘
```

---

## 5. 小结

```
┌───────────────────────────────────────────────────────┐
│                 复合类型速查表                          │
├──────────┬──────────┬─────────┬────────────────────────┤
│  类型     │ 可变长?  │ 值/引用  │ 零值                   │
├──────────┼──────────┼─────────┼────────────────────────┤
│ [N]T     │   否     │  值     │ [0,0,...0]             │
│ []T      │   是     │  引用*  │ nil（可 append）        │
│ map[K]V  │   是     │  引用   │ nil（需 make 后才能写）  │
│ struct   │   否     │  值     │ 各字段都是零值           │
└──────────┴──────────┴─────────┴────────────────────────┘

  * 切片本身是值类型（ptr+len+cap），但指向共享的底层数组

  最常用：
  ┌──────────────────────────────────┐
  │  []T      ← 几乎所有列表场景     │
  │  map[K]V  ← 几乎所有字典场景     │
  │  struct   ← 定义所有业务对象     │
  └──────────────────────────────────┘
```

**下一节：** [03 - 函数与接口](03-functions-and-interfaces.md) — 函数、方法、接口、错误处理
