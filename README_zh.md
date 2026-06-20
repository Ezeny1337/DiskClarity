<p align="center">
  <img src="https://github.com/user-attachments/assets/caee1db4-b020-44c4-a1d5-7d91cfac63f0" alt="DiskClarity Logo" height="180" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Language-Rust-orange?logo=rust" />
  <img src="https://img.shields.io/badge/Language-TypeScript-blue?logo=typescript" />
  <img src="https://img.shields.io/badge/Framework-Tauri-FFC131?logo=tauri" />
  <img src="https://img.shields.io/badge/CSS-Tailwind-06B6D4?logo=tailwindcss" />
  <img src="https://img.shields.io/badge/License-Apache%202.0-blue" />
  <img src="https://img.shields.io/github/v/release/Ezeny1337/DiskClarity?label=Release&color=green" />
</p>

<p align="center">
  📑 <a href="#-概述">概述</a> • <a href="#-特性">特性</a> • <a href="#-安装">安装</a> • <a href="#%EF%B8%8F-支持">支持</a> • <a href="#%EF%B8%8f-许可证">许可证</a>
</p>

<p align="center">
  🌐 <a href="./README.md">English</a> | <a href="./README_zh.md">中文</a>
</p>

---

## 📖 概述

**DiskClarity** 是一款开源的高性能轻量化磁盘空间分析工具，使用 MFT 与现代化 UI 提供极快的扫描速度和全面的存储分析。

### 🚀 特性

**⚡ 极致性能**

- **NTFS MFT 直接解析**: 直接读取 NTFS 的主文件表 (MFT) 进行极速扫描
- **Rust 驱动后端**: 内存安全、零成本抽象，最大化性能
- **并行处理**: 使用 Rayon 库实现多线程扫描
- **内存占用优化**: 极致的运行内存占用优化，媲美原生体验
- **数据传输优化**: 尽可能减少前后端数据传输量

**🎯 高级分析**

- **快照系统**: 保存并比较磁盘文件的变化
- **交互式可视化**: Treemap 图表和分层文件树
- **分组筛选**: 按类型、扩展名分组文件或自定义搜索文件
- **全面排序**: 按名称、大小、修改时间或文件数量排序

**🎨 现代界面**

- **多标签设计**: 同时处理多个分析任务
- **流畅动画**: Framer Motion 驱动的微交互
- **响应式布局**: Material-UI 组件配合 Tailwind CSS 样式
- **国际化支持**: 完整的 i18next 支持

### 🎨 UI

<img width="1920" height="1040" alt="ss1" src="https://github.com/user-attachments/assets/5fc12dbc-c54a-4c82-a9d9-9fae60f7cc8c" />
<img width="1920" height="1040" alt="ss2" src="https://github.com/user-attachments/assets/3c18b9d3-a07d-4870-9485-0625f689ec55" />
<img width="1920" height="1040" alt="ss3" src="https://github.com/user-attachments/assets/b9779a48-f836-4368-b9cd-e23da8f3bf69" />

## 🧰 安装

### 系统要求

- **Windows 10/11**（MFT 解析需要 NTFS 文件系统，需要管理员运行）

### 预构建版本

从 [GitHub Releases](https://github.com/Ezeny1337/DiskClarity/releases) 下载最新版本：

- 便携版可用
- `diskclarity-setup.exe` - Windows 安装程序
- `diskClarity.msi` - 备用 Windows 安装程序

## 🛠️ 支持

如果您想要报告错误，可以 [在 Github 上创建 issue](https://github.com/Ezeny1337/DiskClarity/issues)。

Discord ：**ez3nyck**

QQ: 3443374192

## ⚖️ 许可证

    Copyright [2025] [Ezeny1337]

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
