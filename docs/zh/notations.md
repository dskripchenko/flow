# 表示法：EPC、DFD、IDEF0

三种业务与系统分析表示法以节点类型集合的形式提供：EPC（事件驱动过程链）、DFD（数据流图）和 IDEF0（功能模型）。每个集合都带有自己的调色板以及此类图通常的绘制方向。

```vue
<script setup lang="ts">
import { NOTATIONS, notationRegistry } from '@dskripchenko/flow'
import { FlowEditor } from '@dskripchenko/flow/vue'

const notation = NOTATIONS.epc
</script>

<template>
  <FlowEditor v-model="graph" :registry="notationRegistry('epc')" :palette="notation.palette" />
</template>
```

`FlowView` 接受同样的 `registry`。图的 `meta.direction` 可以采用 `notation.direction`。

## EPC

| 类型            | 图形                               |
| --------------- | ---------------------------------- |
| `epc-event`     | 六边形                             |
| `epc-function`  | 圆角框                             |
| `epc-and`、`epc-or`、`epc-xor` | 带 ∧、∨ 或 × 的连接符圆圈 |
| `epc-org`       | 椭圆（组织单元）                   |
| `epc-info`      | 方框（信息对象）                   |
| `epc-document`  | 文档                               |
| `epc-system`    | 带计算机图标的方框                 |
| `epc-path`      | 可下钻到流程的六边形               |

组织单元、系统和文档通过关联边（`kind: 'association'`）连接到功能。EPC 从上到下排列。

## DFD

| 类型          | 图形                                       |
| ------------- | ------------------------------------------ |
| `dfd-process` | 顶部带编号的椭圆；可下钻到下一层           |
| `dfd-entity`  | 带第二轮廓的方框（外部实体）               |
| `dfd-store`   | 右侧开口的数据存储，编号位于单独的格子中   |

边表示数据流，其标签说明数据。编号来自 `data.number`（`1`、`1.2`、`D1`）。

## IDEF0

| 类型             | 图形                                             |
| ---------------- | ------------------------------------------------ |
| `idef0-function` | 右下角带编号（`A0`、`A1`…）的方框，可下钻        |
| `idef0-boundary` | 胶囊形：图边界上箭头的端点                       |

功能框具有 IDEF0 的四个端口（`IDEF0_PORTS`）：左侧 `input`、上方 `control`、右侧 `output`、下方 `mechanism`。边需指明所用的端口（`toPort: 'control'`）。

布局会把只向另一节点上方或下方端口输入（或只从其输出）的节点放在该节点的上方或下方，而不是放入流程中——因此控制位于功能框之上，机制位于其下，符合 IDEF0 的画法。此规则适用于任何具有此类端口的类型，而不仅限于 IDEF0。
