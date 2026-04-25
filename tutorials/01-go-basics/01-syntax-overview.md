# 01 - Go 基础语法速览

## Go 语言全景图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Go 语言核心特性                            │
├────────────────┬──────────────────┬─────────────────────────────┤
│   简洁的语法    │   内置并发支持     │      强大的标准库             │
│                │                  │                             │
│  • 25个关键字   │  • goroutine     │  • net/http                 │
│  • 类型推断     │  • channel       │  • encoding/json            │
│  • 没有继承     │  • select        │  • database/sql             │
│  • 没有异常     │  • sync 包       │  • os / io                  │
├────────────────┴──────────────────┴─────────────────────────────┤
│              编译快 │ 部署简单(单二进制) │ 跨平台                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. 第一个 Go 程序

```go
package main          // 每个 Go 文件都属于一个包，main 包是程序入口

import "fmt"          // 导入标准库的 fmt 包（格式化输入输出）

func main() {         // main 函数：程序从这里开始执行
    fmt.Println("Hello, Go!")
}
```

**运行方式：**
```bash
# 方式一：直接运行
go run main.go

# 方式二：先编译再运行
go build -o myapp main.go
./myapp
```

**Go 项目初始化：**
```bash
mkdir myproject && cd myproject
go mod init myproject   # 创建 go.mod 文件（类似 Java 的 pom.xml）
```

```
Go 程序结构：

┌──────────────────────────────────┐
│           main.go                │
├──────────────────────────────────┤
│  package main        ◀── 包声明  │
│                                  │
│  import (            ◀── 导入    │
│      "fmt"                       │
│      "net/http"                  │
│  )                               │
│                                  │
│  // 常量/变量        ◀── 包级声明 │
│  var version = "1.0"             │
│                                  │
│  func main() {       ◀── 入口    │
│      // ...                      │
│  }                               │
│                                  │
│  func helper() {     ◀── 其他函数 │
│      // ...                      │
│  }                               │
└──────────────────────────────────┘
```

---

## 2. 变量与常量

### 2.1 变量声明的四种方式

```go
package main

import "fmt"

func main() {
    // 方式一：完整声明（指定类型 + 初始值）
    var name string = "Alice"

    // 方式二：类型推断（编译器自动推断类型）
    var age = 25

    // 方式三：短变量声明（最常用！只能在函数内使用）
    score := 99.5

    // 方式四：只声明不赋值（会有零值）
    var count int       // 零值为 0
    var active bool     // 零值为 false
    var msg string      // 零值为 ""

    fmt.Println(name, age, score, count, active, msg)

    // 批量声明
    var (
        host = "localhost"
        port = 8080
        debug = false
    )
    fmt.Println(host, port, debug)
}
```

### 2.2 Go 的零值系统

```
┌─────────────────────────────────────────────────────┐
│                  Go 零值（Zero Values）               │
│                                                     │
│  与 Java 不同：Go 的变量声明后一定有值，不会是 null     │
│                                                     │
├──────────────┬──────────────────────────────────────┤
│    类型       │    零值                               │
├──────────────┼──────────────────────────────────────┤
│  int/float   │    0 / 0.0                           │
│  bool        │    false                             │
│  string      │    ""  （空字符串）                    │
│  pointer     │    nil                               │
│  slice/map   │    nil （但可以判断长度，不会 panic）   │
│  struct      │    每个字段都是零值                     │
│  interface   │    nil                               │
│  channel     │    nil                               │
└──────────────┴──────────────────────────────────────┘

对比 Java:
  Java:   String s;       // null，使用会 NullPointerException
  Go:     var s string    // ""，使用不会 panic
```

### 2.3 常量

```go
package main

import "fmt"

// 普通常量
const Pi = 3.14159

// 批量常量
const (
    StatusOK    = 200
    StatusError = 500
)

// iota：Go 特有的常量生成器（从 0 开始自增）
const (
    Sunday    = iota  // 0
    Monday            // 1
    Tuesday           // 2
    Wednesday         // 3
    Thursday          // 4
    Friday            // 5
    Saturday          // 6
)

// iota 的高级用法：位运算生成权限
const (
    ReadPerm   = 1 << iota  // 1  (001)
    WritePerm               // 2  (010)
    ExecPerm                // 4  (100)
)

func main() {
    fmt.Println("Wednesday =", Wednesday)  // 3

    // 组合权限
    myPerm := ReadPerm | WritePerm  // 3 (011)
    fmt.Println("可读?", myPerm&ReadPerm != 0)   // true
    fmt.Println("可执行?", myPerm&ExecPerm != 0) // false
}
```

```
iota 工作原理：

const (                     const (
    A = iota  // 0              Read  = 1 << iota  // 1 << 0 = 1
    B         // 1              Write              // 1 << 1 = 2
    C         // 2              Exec               // 1 << 2 = 4
)                           )

   iota 在每个 const 块       可以和表达式组合
   内从 0 开始自增              实现位掩码模式
```

---

## 3. 基本数据类型

```
┌────────────────────────────────────────────────────────────────┐
│                      Go 基本类型一览                            │
├──────────┬─────────────────────────────────────────────────────┤
│          │  int8    int16    int32    int64                    │
│  整数    │  uint8   uint16   uint32   uint64                   │
│          │  int     uint     (平台相关: 32位或64位)              │
│          │  byte (= uint8)   rune (= int32, 代表Unicode字符)   │
├──────────┼─────────────────────────────────────────────────────┤
│  浮点    │  float32    float64                                 │
├──────────┼─────────────────────────────────────────────────────┤
│  复数    │  complex64  complex128                              │
├──────────┼─────────────────────────────────────────────────────┤
│  布尔    │  bool                                               │
├──────────┼─────────────────────────────────────────────────────┤
│  字符串  │  string  (UTF-8 编码，不可变)                        │
└──────────┴─────────────────────────────────────────────────────┘

与 Java 对比：
┌──────────────────────┬────────────────────┐
│       Java           │        Go          │
├──────────────────────┼────────────────────┤
│  int (32位)          │  int (平台相关)     │
│  long (64位)         │  int64             │
│  char (UTF-16)       │  rune (UTF-32)     │
│  String (对象)       │  string (值类型)    │
│  Integer (包装类)    │  不需要，没有包装类  │
│  null                │  nil (仅用于指针等) │
└──────────────────────┴────────────────────┘
```

### 3.1 类型转换

```go
package main

import (
    "fmt"
    "strconv"
)

func main() {
    // Go 不允许隐式类型转换！（比 Java 严格）
    var a int32 = 100
    var b int64 = int64(a)  // 必须显式转换

    var f float64 = 3.14
    var n int = int(f)      // 3（截断，不是四舍五入）

    // 字符串 <-> 数字
    s := strconv.Itoa(42)        // int -> string: "42"
    num, err := strconv.Atoi("42") // string -> int: 42
    if err != nil {
        fmt.Println("转换失败:", err)
    }

    fmt.Println(b, n, s, num)

    // 字符串 <-> 字节切片
    str := "Hello, 世界"
    bytes := []byte(str)         // string -> []byte
    runes := []rune(str)         // string -> []rune
    fmt.Println(len(bytes))      // 13 (UTF-8 字节数)
    fmt.Println(len(runes))      // 9  (字符数)
}
```

```
字符串在内存中的表示：

  "Hello, 世界"

  ┌─────────────────────────────────────────────────────┐
  │ H   e   l   l   o   ,   ' '  世(3字节)  界(3字节)   │
  │ 48  65  6C  6C  6F  2C  20   E4B896     E7958C      │
  └─────────────────────────────────────────────────────┘
  │◄──── ASCII 各1字节 ─────────▶│◄── 中文各3字节 ──▶│

  len("Hello, 世界")       = 13  (字节数)
  len([]rune("Hello, 世界")) = 9   (字符数)

  遍历方式：
    for i, b := range []byte(str) { }   // 按字节
    for i, r := range str { }            // 按字符(rune)  ← 推荐
```

---

## 4. 控制流

### 4.1 if 语句

```go
package main

import "fmt"

func main() {
    score := 85

    // 基本 if-else
    if score >= 90 {
        fmt.Println("优秀")
    } else if score >= 60 {
        fmt.Println("及格")
    } else {
        fmt.Println("不及格")
    }

    // Go 特色：if 可以带初始化语句（变量作用域限定在 if 块内）
    if num := calculateScore(); num > 80 {
        fmt.Println("高分:", num)
    }
    // num 在这里不可访问，这样设计可以减少变量泄漏
}

func calculateScore() int {
    return 85
}
```

### 4.2 for 循环（Go 里唯一的循环！）

```go
package main

import "fmt"

func main() {
    // 形式一：经典 for（类似 Java 的 for）
    for i := 0; i < 5; i++ {
        fmt.Println(i)
    }

    // 形式二：while 风格（Go 没有 while 关键字）
    count := 0
    for count < 5 {
        fmt.Println(count)
        count++
    }

    // 形式三：无限循环
    // for {
    //     // 相当于 while(true)
    //     break  // 用 break 退出
    // }

    // 形式四：range 遍历（最常用）
    fruits := []string{"苹果", "香蕉", "橘子"}
    for index, value := range fruits {
        fmt.Printf("第%d个: %s\n", index, value)
    }

    // 只要 index
    for i := range fruits {
        fmt.Println(i)
    }

    // 只要 value（用 _ 忽略 index）
    for _, fruit := range fruits {
        fmt.Println(fruit)
    }
}
```

```
Go 的 for 一统天下：

  Java                           Go
  ─────────────────────          ─────────────────────
  for (int i=0;i<n;i++)    →    for i := 0; i < n; i++ { }
  while (condition)         →    for condition { }
  while (true)              →    for { }
  for (item : list)         →    for _, item := range list { }

  Go 设计哲学：一种语法，多种用途，减少心智负担
```

### 4.3 switch 语句

```go
package main

import "fmt"

func main() {
    day := "Monday"

    // Go 的 switch 默认 break（和 Java 相反！）
    switch day {
    case "Monday":
        fmt.Println("周一")
        // 不需要 break，自动停止
    case "Tuesday", "Wednesday":  // 可以合并多个 case
        fmt.Println("周中")
    default:
        fmt.Println("其他")
    }

    // 无条件 switch（替代 if-else 链，更优雅）
    score := 85
    switch {
    case score >= 90:
        fmt.Println("A")
    case score >= 80:
        fmt.Println("B")
    case score >= 60:
        fmt.Println("C")
    default:
        fmt.Println("F")
    }

    // 类型 switch（接口类型断言时很有用）
    var val interface{} = "hello"
    switch v := val.(type) {
    case int:
        fmt.Println("整数:", v)
    case string:
        fmt.Println("字符串:", v)
    default:
        fmt.Printf("其他类型: %T\n", v)
    }
}
```

```
switch 行为对比：

  Java:                           Go:
  switch (x) {                    switch x {
      case 1:                     case 1:
          doA();                      doA()
          break;    ← 必须写!         // 自动 break
      case 2:                     case 2:
          doB();                      doB()
          // 没写break会穿透!          // 自动 break
      case 3:                     case 2, 3:
          doC();                      doC()  // 合并 case
          break;                  }
  }

  Go 想穿透？用 fallthrough 关键字（但很少用）
```

---

## 5. 指针

```
Go 的指针 vs Java 的引用：

  Java:                              Go:
  ┌──────────┐    ┌──────────┐       ┌──────────┐    ┌──────────┐
  │ obj(引用) │───▶│ 堆上对象  │       │  p(*int) │───▶│  值: 42  │
  └──────────┘    └──────────┘       └──────────┘    └──────────┘
  自动解引用，无法访问地址              可以取地址，可以解引用

  Go 有指针但没有指针运算（比 C 安全）
  Go 的指针更像是 "可以显式控制的引用"
```

```go
package main

import "fmt"

func main() {
    x := 42

    p := &x      // & 取地址
    fmt.Println(p)   // 输出地址，如 0xc0000b6010
    fmt.Println(*p)  // * 解引用，输出 42

    *p = 100         // 通过指针修改值
    fmt.Println(x)   // 100（x 被修改了）

    // 指针的核心用途：让函数能修改外部变量
    val := 10
    double(&val)
    fmt.Println(val)  // 20
}

func double(p *int) {
    *p = *p * 2
}
```

```
值传递 vs 指针传递：

  func add(x int) {           func add(p *int) {
      x = x + 1                   *p = *p + 1
  }                            }

  ┌─────────┐  复制值  ┌──────┐    ┌─────────┐  复制地址 ┌──────┐
  │ a = 10  │ ──────▶ │x = 10│    │ a = 10  │ ──────▶ │p=&a │
  └─────────┘         └──────┘    └────▲────┘         └──┬───┘
  调用后 a=10         x=11(丢弃)   调用后│a=11           │
                                       └────────────────┘
                                         通过指针修改了原值

  何时用指针？
  ✓ 需要修改传入的值
  ✓ 大结构体（避免拷贝开销）
  ✓ 表示 "可能为空"（nil 指针）
  ✗ 小的值类型（int, bool 等直接传值更快）
```

---

## 6. 小结

```
本节知识点回顾：

  ┌──────────────────────────────────────────┐
  │              Go 基础语法                  │
  ├──────────┬──────────┬──────────┬─────────┤
  │  变量     │  类型    │  控制流   │  指针   │
  │          │         │          │         │
  │  var     │  int    │  if      │  &取址  │
  │  :=      │  string │  for     │  *解引用 │
  │  const   │  bool   │  switch  │  nil    │
  │  iota    │  rune   │  range   │         │
  └──────────┴──────────┴──────────┴─────────┘

  核心理念：
  ┌─────────────────────────────────────────┐
  │  1. 简洁：25个关键字，一种循环            │
  │  2. 显式：不允许隐式类型转换              │
  │  3. 安全：零值系统，有指针但无指针运算     │
  │  4. 务实：设计目标是 "写大型工程的语言"    │
  └─────────────────────────────────────────┘
```

**下一节：** [02 - 复合类型](02-composite-types.md) — 数组、切片、Map、结构体
