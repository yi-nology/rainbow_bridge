# 公共资源目录

这个目录用于存放 VuePress 文档的公共静态资源。

## 目录结构

```
public/
├── images/          # 图片资源
│   ├── logo.svg     # 项目 Logo
│   ├── icon.svg     # 图标
│   └── screenshots/ # 界面截图
├── downloads/       # 下载资源
└── files/          # 其他文件
```

## 使用方式

在 Markdown 中引用：

```markdown
![描述](/images/logo.svg)

[下载文件](/downloads/guide.pdf)
```

## 注意事项

1. 所有图片应优化压缩
2. SVG 格式优先用于图标和简单图形
3. 截图统一放在 `screenshots/` 子目录
4. 大文件（>1MB）建议使用外部链接
