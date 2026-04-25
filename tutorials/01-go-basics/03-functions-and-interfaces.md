# 03 - 函数、接口与错误处理

## 本节全景图

```
┌─────────────────────────────────────────────────────────┐
│                函数 & 接口 & 错误处理                     │
├───────────────┬──────────────────┬──────────────────────┤
│    函数        │     接口          │     错误处理          │
│               │                  │                      │
│  多返回值      │  隐式实现         │  error 接口           │
│  一等公民      │  鸭子类型         │  多返回值模式          │
│  闭包         │  空接口 any       │  defer/panic/recover │
│  可变参数      │  类型断言         │  错误包装 %w          │
└───────────────┴──────────────────┴──────────────────────┘
```

---

## 1. 函数（Function）

### 1.1 基本语法

```go
package main

import "fmt"

// 基本函数
func add(a int, b int) int {
    return a + b
}

// 参数类型相同可以简写
func multiply(a, b int) int {
    return a * b
}

// 多返回值（Go 最重要的特性之一！）
func divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, fmt.Errorf("除数不能为零")
    }
    return a / b, nil
}

// 命名返回值
func stats(numbers []int) (min, max, sum int) {
    min = numbers[0]
    max = numbers[0]
    for _, n := range numbers {
        if n < min { min = n }
        if n > max { max = n }
        sum += n
    }
    return  // 裸 return，自动返回命名的变量
}

func main() {
    fmt.Println(add(3, 5))

    result, err := divide(10, 3)
    if err != nil {
        fmt.Println("错误:", err)
        return
    }
    fmt.Printf("结果: %.2f\n", result)

    lo, hi, total := stats([]int{3, 1, 4, 1, 5, 9})
    fmt.Printf("min=%d max=%d sum=%d\n", lo, hi, total)
}
```

```
多返回值 —— Go vs Java：

  Java:                                Go:
  ┌────────────────────────┐           ┌──────────────────────────┐
  │ // 只能返回一个值        │           │ // 可以返回多个值          │
  │ Result divide(a, b) {  │           │ func divide(a, b float64)│
  │   if (b == 0)          │           │   (float64, error) {     │
  │     throw Exception(); │           │   if b == 0 {            │
  │   return a / b;        │           │     return 0, err        │
  │ }                      │           │   }                      │
  │                        │           │   return a/b, nil        │
  │ // 调用端：             │           │ }                        │
  │ try {                  │           │                          │
  │   r = divide(10, 0);   │           │ // 调用端：               │
  │ } catch (Exception e) {│           │ r, err := divide(10, 0)  │
  │   // 处理              │           │ if err != nil {          │
  │ }                      │           │   // 处理                │
  │                        │           │ }                        │
  └────────────────────────┘           └──────────────────────────┘

  Go 用多返回值替代了异常机制
  (value, error) 是 Go 中最经典的模式
```

### 1.2 函数是一等公民

```go
package main

import "fmt"

// 函数类型
type MathFunc func(int, int) int

// 高阶函数：接受函数作为参数
func apply(a, b int, fn MathFunc) int {
    return fn(a, b)
}

// 返回函数
func makeMultiplier(factor int) func(int) int {
    return func(x int) int {
        return x * factor  // 闭包：捕获了外部变量 factor
    }
}

func main() {
    // 函数赋值给变量
    add := func(a, b int) int { return a + b }
    sub := func(a, b int) int { return a - b }

    fmt.Println(apply(10, 3, add))  // 13
    fmt.Println(apply(10, 3, sub))  // 7

    // 闭包
    double := makeMultiplier(2)
    triple := makeMultiplier(3)
    fmt.Println(double(5))  // 10
    fmt.Println(triple(5))  // 15

    // 匿名函数立即执行
    result := func(x int) int {
        return x * x
    }(5)
    fmt.Println(result)  // 25
}
```

```
闭包(Closure) 的内存示意：

  makeMultiplier(2) 返回的函数：

  ┌─────────────────────────────┐
  │  闭包 = 函数代码 + 环境      │
  │  ┌─────────────────────┐   │
  │  │ func(x int) int {   │   │
  │  │   return x * factor │   │
  │  │ }                   │   │
  │  └──────────┬──────────┘   │
  │             │ 引用         │
  │  ┌──────────▼──────────┐   │
  │  │ factor = 2          │   │   ← 被闭包捕获，不会被 GC
  │  └─────────────────────┘   │
  └─────────────────────────────┘

  double(5) → 5 * 2 = 10
  triple(5) → 5 * 3 = 15   ← triple 捕获的 factor = 3

  每次调用 makeMultiplier 都会创建一个新的 factor
  各闭包之间互不影响
```

### 1.3 可变参数

```go
package main

import "fmt"

// ...int 表示接收任意数量的 int 参数
func sum(nums ...int) int {
    total := 0
    for _, n := range nums {
        total += n
    }
    return total
}

func main() {
    fmt.Println(sum(1, 2, 3))       // 6
    fmt.Println(sum(1, 2, 3, 4, 5)) // 15

    // 传入切片时用 ... 展开
    numbers := []int{10, 20, 30}
    fmt.Println(sum(numbers...))     // 60
}
```

---

## 2. 接口（Interface）

### 2.1 接口的核心理念

```
Go 接口 = 隐式实现（鸭子类型）

  "If it walks like a duck and quacks like a duck, it's a duck"
  "如果它走路像鸭子、叫声像鸭子，那它就是鸭子"

  Java:                                Go:
  ┌──────────────────────┐            ┌──────────────────────┐
  │ interface Animal {   │            │ type Animal interface│
  │   void speak();      │            │ {                    │
  │ }                    │            │     Speak() string   │
  │                      │            │ }                    │
  │ class Dog            │            │                      │
  │   implements Animal {│ ← 显式声明  │ type Dog struct{}    │
  │   void speak() {...} │            │ func (d Dog) Speak() │
  │ }                    │            │   string { ... }     │
  └──────────────────────┘            └──────────────────────┘
                                        ↑ 没有 implements！
                                        只要有 Speak() 方法就自动满足

  优势：
  ┌────────────────────────────────────────────────┐
  │  1. 解耦：定义接口的包不需要知道实现者            │
  │  2. 灵活：第三方的类型也能满足你的接口             │
  │  3. 小接口：Go 鼓励 1-2 个方法的小接口           │
  └────────────────────────────────────────────────┘
```

### 2.2 定义和使用

```go
package main

import (
    "fmt"
    "math"
)

// 定义接口：只描述行为，不描述数据
type Shape interface {
    Area() float64
    Perimeter() float64
}

// --- Circle 实现了 Shape（隐式） ---
type Circle struct {
    Radius float64
}

func (c Circle) Area() float64 {
    return math.Pi * c.Radius * c.Radius
}

func (c Circle) Perimeter() float64 {
    return 2 * math.Pi * c.Radius
}

// --- Rectangle 也实现了 Shape（隐式） ---
type Rectangle struct {
    Width, Height float64
}

func (r Rectangle) Area() float64 {
    return r.Width * r.Height
}

func (r Rectangle) Perimeter() float64 {
    return 2 * (r.Width + r.Height)
}

// 接受接口类型的函数 → 多态！
func printShape(s Shape) {
    fmt.Printf("面积=%.2f  周长=%.2f\n", s.Area(), s.Perimeter())
}

func main() {
    c := Circle{Radius: 5}
    r := Rectangle{Width: 3, Height: 4}

    printShape(c)  // 面积=78.54  周长=31.42
    printShape(r)  // 面积=12.00  周长=14.00

    // 接口切片：多态集合
    shapes := []Shape{c, r, Circle{Radius: 1}}
    for _, s := range shapes {
        printShape(s)
    }
}
```

```
接口满足关系的可视化：

  type Shape interface {
      Area() float64
      Perimeter() float64
  }

  Circle:                     Rectangle:
  ┌──────────────────┐        ┌──────────────────┐
  │ Radius float64   │        │ Width float64     │
  │                  │        │ Height float64    │
  │ Area() ✓         │        │ Area() ✓          │
  │ Perimeter() ✓    │        │ Perimeter() ✓     │
  └────────┬─────────┘        └────────┬──────────┘
           │                           │
           │  满足 Shape               │  满足 Shape
           ▼                           ▼
  ┌──────────────────────────────────────────────┐
  │              Shape 接口                       │
  │     可以放 Circle 也可以放 Rectangle           │
  └──────────────────────────────────────────────┘
```

### 2.3 标准库中的经典接口

```go
package main

import (
    "fmt"
    "strings"
)

// io.Reader — 只有一个方法的接口（Go 推崇小接口）
// type Reader interface {
//     Read(p []byte) (n int, err error)
// }

// fmt.Stringer — Go 的 toString()
// type Stringer interface {
//     String() string
// }

type User struct {
    Name string
    Age  int
}

// 实现 Stringer 接口
func (u User) String() string {
    return fmt.Sprintf("%s (age %d)", u.Name, u.Age)
}

// error 接口 — Go 错误处理的基础
// type error interface {
//     Error() string
// }

type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation failed on %s: %s", e.Field, e.Message)
}

func main() {
    u := User{Name: "Alice", Age: 30}
    fmt.Println(u)  // "Alice (age 30)" — 自动调用 String()

    r := strings.NewReader("Hello")
    buf := make([]byte, 5)
    r.Read(buf)
    fmt.Println(string(buf))  // "Hello"
}
```

```
Go 标准库经典小接口：

  ┌────────────────────────────────────────────────┐
  │  接口名         方法                 用途       │
  ├────────────────────────────────────────────────┤
  │  io.Reader     Read([]byte)(int,error)  读数据 │
  │  io.Writer     Write([]byte)(int,error) 写数据 │
  │  io.Closer     Close() error           关闭   │
  │  fmt.Stringer  String() string         打印   │
  │  error         Error() string          错误   │
  │  sort.Interface  Len/Less/Swap         排序   │
  │  http.Handler  ServeHTTP(w,r)          HTTP  │
  └────────────────────────────────────────────────┘

  Go 格言："接口越小，抽象越有用"
  io.Reader 只有一个方法，但整个标准库都围绕它构建
```

### 2.4 空接口和类型断言

```go
package main

import "fmt"

func main() {
    // any (= interface{}) 可以存放任何类型的值
    var anything any
    anything = 42
    anything = "hello"
    anything = []int{1, 2, 3}

    // 类型断言：从 any 中取出具体类型
    str, ok := anything.([]int)
    if ok {
        fmt.Println("是切片:", str)
    }

    // 类型 switch
    describe(42)
    describe("hello")
    describe(true)
    describe([]int{1, 2})
}

func describe(val any) {
    switch v := val.(type) {
    case int:
        fmt.Printf("整数: %d\n", v)
    case string:
        fmt.Printf("字符串: %q (长度=%d)\n", v, len(v))
    case bool:
        fmt.Printf("布尔: %t\n", v)
    default:
        fmt.Printf("其他类型: %T = %v\n", v, v)
    }
}
```

```
类型断言的工作原理：

  一个 interface 变量内部存了两样东西：

  var s Shape = Circle{Radius: 5}

  ┌──────────────────────────────┐
  │  interface 变量 s             │
  │  ┌───────────────────────┐   │
  │  │ type: *Circle 的类型信息│   │
  │  ├───────────────────────┤   │
  │  │ value: Circle{R: 5}  │   │   ← 实际数据
  │  └───────────────────────┘   │
  └──────────────────────────────┘

  类型断言 s.(Circle)：
    → 检查 type 是不是 Circle
    → 是：返回 value + true
    → 否：返回零值 + false

  类型 switch：
    → 依次检查 type，执行匹配的分支
```

---

## 3. 错误处理

### 3.1 Go 的错误处理哲学

```
Go 没有 try-catch-finally！

  Java:                              Go:
  ┌─────────────────────┐           ┌─────────────────────────┐
  │ try {               │           │ result, err := doSth()  │
  │   result = doSth(); │           │ if err != nil {         │
  │ } catch (Ex e) {    │           │   // 处理错误            │
  │   // 处理            │           │   return err            │
  │ } finally {         │           │ }                       │
  │   // 清理            │           │ defer cleanup()         │
  │ }                   │           │ // 继续正常逻辑          │
  └─────────────────────┘           └─────────────────────────┘

  Go 的理念：
  ┌──────────────────────────────────────────────────┐
  │  错误是值（value），不是异常（exception）            │
  │  错误要在产生的地方立即处理，不要抛来抛去             │
  │  代码会有很多 if err != nil，这是 Go 的风格         │
  └──────────────────────────────────────────────────┘
```

### 3.2 错误处理实战

```go
package main

import (
    "errors"
    "fmt"
    "os"
)

// 自定义错误类型
type NotFoundError struct {
    Name string
}

func (e *NotFoundError) Error() string {
    return fmt.Sprintf("%s not found", e.Name)
}

// 哨兵错误（预定义的全局错误值）
var ErrPermission = errors.New("permission denied")

func readConfig(path string) (string, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        // 错误包装：用 %w 保留原始错误链
        return "", fmt.Errorf("读取配置文件失败: %w", err)
    }
    if len(data) == 0 {
        return "", &NotFoundError{Name: path}
    }
    return string(data), nil
}

func main() {
    content, err := readConfig("/nonexistent/config.yaml")
    if err != nil {
        // 检查是否是特定类型的错误
        var nfe *NotFoundError
        if errors.As(err, &nfe) {
            fmt.Println("文件不存在:", nfe.Name)
            return
        }

        // 检查是否是特定的哨兵错误
        if errors.Is(err, os.ErrNotExist) {
            fmt.Println("路径不存在")
            return
        }

        fmt.Println("其他错误:", err)
        return
    }
    fmt.Println(content)
}
```

```
错误链 (Error Chain)：

  底层错误:     os.ErrNotExist
                    │
                    │ 被包装
                    ▼
  中间层:       fmt.Errorf("open %s: %w", path, err)
                    │
                    │ 被包装
                    ▼
  业务层:       fmt.Errorf("读取配置失败: %w", err)

  最终错误信息: "读取配置失败: open /xxx: file does not exist"

  errors.Is(err, os.ErrNotExist)  →  沿着链查找
  errors.As(err, &target)         →  沿着链找匹配的类型

  ┌──────────────────────────────────────────┐
  │ errors.Is → 这个错误（或它包装的错误）      │
  │             是不是某个特定值？               │
  │                                          │
  │ errors.As → 这个错误（或它包装的错误）      │
  │             能不能转成某个特定类型？          │
  └──────────────────────────────────────────┘
```

### 3.3 defer — 延迟执行

```go
package main

import (
    "fmt"
    "os"
)

func main() {
    // defer 会在函数返回前执行（类似 Java 的 finally）
    fmt.Println("开始")
    defer fmt.Println("3 - 最后执行")
    defer fmt.Println("2 - 倒数第二")
    defer fmt.Println("1 - 倒数第一")
    fmt.Println("结束")

    // 输出：开始 → 结束 → 1 → 2 → 3（LIFO 栈顺序）

    // 最常见用途：确保资源被关闭
    content, err := readFile("test.txt")
    if err != nil {
        fmt.Println(err)
        return
    }
    fmt.Println(content)
}

func readFile(path string) (string, error) {
    f, err := os.Open(path)
    if err != nil {
        return "", err
    }
    defer f.Close()  // 无论后面发生什么，f 一定会被关闭

    buf := make([]byte, 1024)
    n, err := f.Read(buf)
    if err != nil {
        return "", err  // 即使这里 return，defer 的 Close 也会执行
    }
    return string(buf[:n]), nil
}
```

```
defer 执行顺序（LIFO 栈）：

  func example() {
      defer A()       ←─┐
      defer B()       ←─┤  入栈
      defer C()       ←─┘
      // ... 函数逻辑
      return          ←── 触发
  }                       │
                          ▼
  执行顺序:  C() → B() → A()  （后进先出）

  ┌─────────┐
  │  C()    │ ← 栈顶，先出
  ├─────────┤
  │  B()    │
  ├─────────┤
  │  A()    │ ← 栈底，最后
  └─────────┘

  经典用法：
    f, _ := os.Open(path)
    defer f.Close()           // 保证关闭

    mu.Lock()
    defer mu.Unlock()         // 保证解锁

    tx := db.Begin()
    defer tx.Rollback()       // 保证回滚（commit 后 rollback 是 no-op）
```

### 3.4 panic 和 recover（很少用）

```go
package main

import "fmt"

func safeDivide(a, b int) (result int, err error) {
    // recover 必须在 defer 中调用
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("caught panic: %v", r)
        }
    }()

    // 这会触发 panic（除以零）
    return a / b, nil
}

func main() {
    result, err := safeDivide(10, 0)
    if err != nil {
        fmt.Println("错误:", err)
        return
    }
    fmt.Println(result)
}
```

```
panic/recover 使用指南：

  ┌───────────────────────────────────────────────┐
  │  panic 何时用？                                │
  │  ✗ 不要用 panic 代替 error return              │
  │  ✗ 不要用 panic 处理业务逻辑错误               │
  │  ✓ 程序初始化失败（必须停止）                   │
  │  ✓ 真正不可恢复的情况                          │
  │                                               │
  │  recover 何时用？                              │
  │  ✓ HTTP 框架的中间件（防止一个请求崩溃整个服务） │
  │  ✓ goroutine 的顶层保护                        │
  │                                               │
  │  99% 的情况用 error 就够了                      │
  └───────────────────────────────────────────────┘
```

---

## 4. 小结

```
┌─────────────────────────────────────────────────────┐
│            函数 & 接口 & 错误处理 速查                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│  函数:                                              │
│  ├── func name(a T, b T) (T, error)  多返回值       │
│  ├── func(a T) T                     匿名函数       │
│  ├── func(args ...T)                 可变参数        │
│  └── 函数选项模式                     构造复杂对象    │
│                                                     │
│  接口:                                              │
│  ├── type X interface { Method() }   定义行为       │
│  ├── 隐式实现（不需要 implements）    鸭子类型        │
│  ├── any = interface{}               空接口         │
│  └── val.(Type) / switch val.(type)  类型断言       │
│                                                     │
│  错误:                                              │
│  ├── if err != nil { return err }    基本模式       │
│  ├── fmt.Errorf("...: %w", err)      错误包装       │
│  ├── errors.Is / errors.As           错误检查       │
│  └── defer / panic / recover         延迟与恢复     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**下一节：** [04 - 并发编程](04-concurrency.md) — Goroutine、Channel、GMP 模型（重点！）
