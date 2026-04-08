# 虹桥计划组件使用指南

## 1. 概述

本指南详细介绍了虹桥计划前端项目中使用的 UI 组件，包括组件的基本用法、API 文档和使用示例。通过遵循本指南，开发团队可以确保组件的一致使用，提高开发效率和代码质量。

## 2. 按钮 (Button)

### 2.1 基本用法

```vue
<template>
  <Button>默认按钮</Button>
  <Button variant="destructive">危险按钮</Button>
  <Button variant="outline">轮廓按钮</Button>
  <Button variant="secondary">次要按钮</Button>
  <Button variant="ghost">幽灵按钮</Button>
  <Button variant="link">链接按钮</Button>
</template>

<script setup lang="ts">
import Button from '@/components/ui/button/Button.vue'
</script>
```

### 2.2 API

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| variant | 'default'  'destructive'  'outline'  'secondary'  'ghost'  'link' | 'default' | 按钮变体 |
| size | 'default'  'sm'  'lg'  'icon' | 'default' | 按钮尺寸 |
| class | string | '' | 额外的 CSS 类 |
| disabled | boolean | false | 是否禁用 |
| type | 'button'  'submit'  'reset' | 'button' | 按钮类型 |
| loading | boolean | false | 是否显示加载状态 |

### 2.3 尺寸示例

```vue
<template>
  <Button size="sm">小按钮</Button>
  <Button>默认按钮</Button>
  <Button size="lg">大按钮</Button>
  <Button size="icon">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
    </svg>
  </Button>
</template>
```

## 3. 卡片 (Card)

### 3.1 基本用法

```vue
<template>
  <Card>
    <CardHeader>
      <CardTitle>卡片标题</CardTitle>
      <CardDescription>卡片描述</CardDescription>
    </CardHeader>
    <CardContent>
      <p>卡片内容</p>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import Card from '@/components/ui/card/Card.vue'
import CardContent from '@/components/ui/card/CardContent.vue'
import CardDescription from '@/components/ui/card/CardDescription.vue'
import CardHeader from '@/components/ui/card/CardHeader.vue'
import CardTitle from '@/components/ui/card/CardTitle.vue'
</script>
```

### 3.2 API

#### Card

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| variant | 'default'  'elevated'  'outline'  'plain' | 'default' | 卡片变体 |
| size | 'default'  'sm'  'md'  'lg' | 'default' | 卡片尺寸 |
| class | string | '' | 额外的 CSS 类 |

#### CardHeader

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |

#### CardTitle

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |

#### CardDescription

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |

#### CardContent

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |

### 3.3 变体示例

```vue
<template>
  <Card variant="default">默认卡片</Card>
  <Card variant="elevated">高海拔卡片</Card>
  <Card variant="outline">轮廓卡片</Card>
  <Card variant="plain">纯卡片</Card>
</template>
```

## 4. 输入框 (Input)

### 4.1 基本用法

```vue
<template>
  <div class="space-y-2">
    <Label for="email">邮箱</Label>
    <Input id="email" placeholder="请输入邮箱" />
  </div>
</template>

<script setup lang="ts">
import Input from '@/components/ui/input/Input.vue'
import Label from '@/components/ui/label/Label.vue'
</script>
```

### 4.2 API

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| type | string | 'text' | 输入框类型 |
| placeholder | string | '' | 占位文本 |
| disabled | boolean | false | 是否禁用 |
| required | boolean | false | 是否必填 |
| class | string | '' | 额外的 CSS 类 |

### 4.3 文本域 (Textarea)

```vue
<template>
  <div class="space-y-2">
    <Label for="message">消息</Label>
    <Textarea id="message" placeholder="请输入消息" rows="4" />
  </div>
</template>

<script setup lang="ts">
import Textarea from '@/components/ui/textarea/Textarea.vue'
import Label from '@/components/ui/label/Label.vue'
</script>
```

## 5. 对话框 (Dialog)

### 5.1 基本用法

```vue
<template>
  <Dialog>
    <DialogTrigger as-child>
      <Button>打开对话框</Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>对话框标题</DialogTitle>
        <DialogDescription>对话框描述</DialogDescription>
      </DialogHeader>
      <div class="py-4">
        <p>对话框内容</p>
      </div>
      <DialogFooter>
        <Button variant="outline">取消</Button>
        <Button>确认</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import Dialog from '@/components/ui/dialog/Dialog.vue'
import DialogContent from '@/components/ui/dialog/DialogContent.vue'
import DialogDescription from '@/components/ui/dialog/DialogDescription.vue'
import DialogFooter from '@/components/ui/dialog/DialogFooter.vue'
import DialogHeader from '@/components/ui/dialog/DialogHeader.vue'
import DialogTitle from '@/components/ui/dialog/DialogTitle.vue'
import DialogTrigger from '@/components/ui/dialog/DialogTrigger.vue'
import Button from '@/components/ui/button/Button.vue'
</script>
```

### 5.2 API

#### Dialog

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| open | boolean | false | 对话框是否打开 |
| onOpenChange | (open: boolean) => void | | 对话框打开状态变化回调 |

#### DialogTrigger

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| as-child | boolean | false | 是否作为子元素 |
| class | string | '' | 额外的 CSS 类 |

#### DialogContent

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |
| align | 'start'  'center' | 'center' | 对话框对齐方式 |
| side | 'top'  'bottom' | 'top' | 对话框位置 |
| dismissible | boolean | true | 是否可关闭 |
| closeOnEscape | boolean | true | 是否按 ESC 键关闭 |

## 6. 标签页 (Tabs)

### 6.1 基本用法

```vue
<template>
  <Tabs defaultValue="tab1">
    <TabsList>
      <TabsTrigger value="tab1">标签 1</TabsTrigger>
      <TabsTrigger value="tab2">标签 2</TabsTrigger>
      <TabsTrigger value="tab3">标签 3</TabsTrigger>
    </TabsList>
    <TabsContent value="tab1">内容 1</TabsContent>
    <TabsContent value="tab2">内容 2</TabsContent>
    <TabsContent value="tab3">内容 3</TabsContent>
  </Tabs>
</template>

<script setup lang="ts">
import Tabs from '@/components/ui/tabs/Tabs.vue'
import TabsContent from '@/components/ui/tabs/TabsContent.vue'
import TabsList from '@/components/ui/tabs/TabsList.vue'
import TabsTrigger from '@/components/ui/tabs/TabsTrigger.vue'
</script>
```

### 6.2 API

#### Tabs

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| defaultValue | string | '' | 默认选中的标签值 |
| value | string | '' | 选中的标签值（受控） |
| onValueChange | (value: string) => void | | 标签值变化回调 |

#### TabsList

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |

#### TabsTrigger

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| value | string | '' | 标签值 |
| disabled | boolean | false | 是否禁用 |
| class | string | '' | 额外的 CSS 类 |

#### TabsContent

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| value | string | '' | 内容值 |
| class | string | '' | 额外的 CSS 类 |

## 7. 表格 (Table)

### 7.1 基本用法

```vue
<template>
  <div class="w-full">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>名称</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="item in items" :key="item.id">
          <TableCell>{{ item.name }}</TableCell>
          <TableCell>{{ item.status }}</TableCell>
          <TableCell>
            <Button size="sm" variant="outline">编辑</Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>

<script setup lang="ts">
import Table from '@/components/ui/table/Table.vue'
import TableBody from '@/components/ui/table/TableBody.vue'
import TableCell from '@/components/ui/table/TableCell.vue'
import TableHead from '@/components/ui/table/TableHead.vue'
import TableHeader from '@/components/ui/table/TableHeader.vue'
import TableRow from '@/components/ui/table/TableRow.vue'
import Button from '@/components/ui/button/Button.vue'

const items = [
  { id: 1, name: '项目 1', status: '活跃' },
  { id: 2, name: '项目 2', status: '已完成' },
  { id: 3, name: '项目 3', status: '进行中' },
]
</script>
```

### 7.2 API

#### Table

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |

#### TableHeader

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |

#### TableBody

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |

#### TableRow

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |

#### TableHead

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |

#### TableCell

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |

## 8. 选择器 (Select)

### 8.1 基本用法

```vue
<template>
  <div class="space-y-2">
    <Label for="role">角色</Label>
    <Select>
      <SelectTrigger id="role">
        <SelectValue placeholder="选择角色" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">管理员</SelectItem>
        <SelectItem value="user">用户</SelectItem>
        <SelectItem value="guest">访客</SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>

<script setup lang="ts">
import Select from '@/components/ui/select/Select.vue'
import SelectContent from '@/components/ui/select/SelectContent.vue'
import SelectItem from '@/components/ui/select/SelectItem.vue'
import SelectTrigger from '@/components/ui/select/SelectTrigger.vue'
import SelectValue from '@/components/ui/select/SelectValue.vue'
import Label from '@/components/ui/label/Label.vue'
</script>
```

### 8.2 API

#### Select

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| defaultValue | string | '' | 默认选中的值 |
| value | string | '' | 选中的值（受控） |
| onValueChange | (value: string) => void | | 值变化回调 |

#### SelectTrigger

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |

#### SelectContent

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |
| position | 'popper'  'menu' | 'popper' | 内容位置 |
| align | 'start'  'center' | 'start' | 对齐方式 |
| side | 'top'  'bottom' | 'bottom' | 位置 |

#### SelectItem

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| value | string | '' | 选项值 |
| disabled | boolean | false | 是否禁用 |
| class | string | '' | 额外的 CSS 类 |

## 9. 开关 (Switch)

### 9.1 基本用法

```vue
<template>
  <div class="flex items-center space-x-2">
    <Switch id="toggle" v-model="isEnabled" />
    <Label for="toggle">启用功能</Label>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Switch from '@/components/ui/switch/Switch.vue'
import Label from '@/components/ui/label/Label.vue'

const isEnabled = ref(false)
</script>
```

### 9.2 API

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| v-model | boolean | false | 开关状态 |
| disabled | boolean | false | 是否禁用 |
| class | string | '' | 额外的 CSS 类 |

## 10. 徽章 (Badge)

### 10.1 基本用法

```vue
<template>
  <Badge>默认徽章</Badge>
  <Badge variant="secondary">次要徽章</Badge>
  <Badge variant="destructive">危险徽章</Badge>
  <Badge variant="outline">轮廓徽章</Badge>
</template>

<script setup lang="ts">
import Badge from '@/components/ui/badge/Badge.vue'
</script>
```

### 10.2 API

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| variant | 'default'  'secondary'  'destructive'  'outline' | 'default' | 徽章变体 |
| class | string | '' | 额外的 CSS 类 |

## 11. 警告 (Alert)

### 11.1 基本用法

```vue
<template>
  <Alert>
    <AlertTitle>信息</AlertTitle>
    <AlertDescription>这是一条信息提示</AlertDescription>
  </Alert>
  
  <Alert variant="destructive">
    <AlertTitle>错误</AlertTitle>
    <AlertDescription>这是一条错误提示</AlertDescription>
  </Alert>
</template>

<script setup lang="ts">
import Alert from '@/components/ui/alert/Alert.vue'
import AlertDescription from '@/components/ui/alert/AlertDescription.vue'
import AlertTitle from '@/components/ui/alert/AlertTitle.vue'
</script>
```

### 11.2 API

#### Alert

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| variant | 'default'  'destructive' | 'default' | 警告变体 |
| class | string | '' | 额外的 CSS 类 |

#### AlertTitle

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |

#### AlertDescription

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |

## 12. 提示框 (Tooltip)

### 12.1 基本用法

```vue
<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <Button variant="outline">悬停查看提示</Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>这是一个提示框</p>
    </TooltipContent>
  </Tooltip>
</template>

<script setup lang="ts">
import Tooltip from '@/components/ui/tooltip/Tooltip.vue'
import TooltipContent from '@/components/ui/tooltip/TooltipContent.vue'
import TooltipTrigger from '@/components/ui/tooltip/TooltipTrigger.vue'
import Button from '@/components/ui/button/Button.vue'
</script>
```

### 12.2 API

#### Tooltip

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| open | boolean | false | 提示框是否打开 |
| onOpenChange | (open: boolean) => void | | 提示框打开状态变化回调 |

#### TooltipTrigger

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| as-child | boolean | false | 是否作为子元素 |
| class | string | '' | 额外的 CSS 类 |

#### TooltipContent

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |
| side | 'top'  'bottom'  'left'  'right' | 'top' | 提示框位置 |
| align | 'start'  'center'  'end' | 'center' | 对齐方式 |

## 13. 骨架屏 (Skeleton)

### 13.1 基本用法

```vue
<template>
  <div class="space-y-4">
    <Skeleton class="h-4 w-3/4" />
    <Skeleton class="h-4 w-1/2" />
    <Skeleton class="h-4 w-5/6" />
  </div>
</template>

<script setup lang="ts">
import Skeleton from '@/components/ui/skeleton/Skeleton.vue'
</script>
```

### 13.2 API

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |

## 14. 加载动画 (Spinner)

### 14.1 基本用法

```vue
<template>
  <div class="flex items-center space-x-2">
    <Spinner />
    <span>加载中...</span>
  </div>
</template>

<script setup lang="ts">
import Spinner from '@/components/ui/spinner/Spinner.vue'
</script>
```

### 14.2 API

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |

## 15. 布局 (Layout)

### 15.1 基本用法

```vue
<template>
  <Layout>
    <template #sidebar>
      <!-- 侧边栏内容 -->
    </template>
    <template #content>
      <!-- 主内容 -->
    </template>
  </Layout>
</template>

<script setup lang="ts">
import Layout from '@/components/ui/layout/Layout.vue'
</script>
```

### 15.2 API

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| class | string | '' | 额外的 CSS 类 |

## 16. 组件使用最佳实践

1. **一致性**：在整个应用中保持组件的一致使用，遵循设计规范
2. **组合性**：利用组件的组合能力，构建复杂的 UI 界面
3. **可访问性**：确保组件的可访问性，支持键盘导航和屏幕阅读器
4. **性能**：合理使用组件，避免不必要的渲染和计算
5. **维护性**：遵循组件的 API 文档，避免直接修改组件内部实现

## 17. 结语

本指南提供了虹桥计划前端项目中使用的 UI 组件的详细说明，包括基本用法、API 文档和使用示例。通过遵循本指南，开发团队可以确保组件的一致使用，提高开发效率和代码质量。

随着项目的发展，组件库会不断更新和完善，本指南也会相应地更新。请定期查看最新版本的组件使用指南，以确保使用最新的组件和最佳实践。