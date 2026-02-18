<p align="center">
  <img src="https://github.com/user-attachments/assets/caee1db4-b020-44c4-a1d5-7d91cfac63f0" alt="DiskClarity Logo" height="180" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Language-Rust-orange?logo=rust" />
  <img src="https://img.shields.io/badge/Language-TypeScript-blue?logo=typescript" />
  <img src="https://img.shields.io/badge/License-Apache%202.0-blue" />
  <img src="https://img.shields.io/github/v/release/Ezeny1337/DiskClarity?label=Release&color=green" />
</p>

<p align="center">
  📑 <a href="#-overview">Overview</a> • <a href="#-features">Features</a> • <a href="#-installation">Installation</a> • <a href="#%EF%B8%8F-support">Support</a> • <a href="#%EF%B8%8F-license">License</a>
</p>

<p align="center">
  🌐 <a href="./README.md">English</a> | <a href="./README_zh.md">中文</a>
</p>

---

## 📖 Overview

**DiskClarity** is an open-source high-performance lightweight disk space analysis tool that uses MFT and modern UI to provide extremely fast scanning speed and comprehensive storage analysis.

### 🚀 Features

**⚡ Extreme Performance**
- **NTFS MFT Direct Parsing**: Directly read the main file table (MFT) of NTFS for fast scanning
- **Rust-Powered Backend**: Memory-safe, zero-cost abstractions with maximum performance
- **Parallel Processing**: Multi-threaded scanning using Rayon library
- **Optimized Data Transfer**: Reduces frontend-backend data transfer as much as possible
- **Allocator**: Mimalloc high-performance memory allocation reduces fragmentation

**🎯 Advanced Analytics**
- **Snapshot System**: Save and compare changes to disk files
- **Interactive Visualizations**: Treemap charts and hierarchical file trees
- **Group filtering**: Group files by type and extension or customize search files
- **Comprehensive Sorting**: Sort by name, size, modification time, or file count

**🎨 Modern Interface**
- **Multi-Tab Design**: Handle multiple analysis tasks simultaneously
- **Smooth Animations**: Framer Motion powered micro-interactions
- **Responsive Layout**: Material-UI components with Tailwind CSS styling
- **Internationalization**: Full i18n support with i18next

### 🎨 UI
<img width="1920" height="1040" alt="ss1" src="https://github.com/user-attachments/assets/1e696e3f-b60a-486b-a0da-a8fd5a6b8744" />
<img width="1920" height="1040" alt="ss2" src="https://github.com/user-attachments/assets/317d13d8-f361-4fe9-938b-924b898d6145" />
<img width="1920" height="1040" alt="ss3" src="https://github.com/user-attachments/assets/a0413e92-b570-4777-b701-127f688608fd" />

## 🧰 Installation

### Prerequisites
- **Windows 10/11** (NTFS file system required for MFT parsing and needs to be run by an administrator)
- **Node.js 18+** for development
- **Rust 1.70+** for building from source

### Pre-built Releases
Download the latest release from [GitHub Releases](https://github.com/Ezeny1337/DiskClarity/releases):
- Portable versions available
- `diskclarity-setup.exe` - Windows installer
- `DiskClarity.msi` - Alternative Windows installer

### Build from Source
```bash
# Clone the repository
git clone https://github.com/Ezeny1337/DiskClarity.git
cd DiskClarity

# Install dependencies
npm install

# Development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## 🛠️ Support

If you want to report bugs, you can [open an issue on Github](https://github.com/Ezeny1337/DiskClarity/issues).

Discord: **ez3nyck**

QQ: 3443374192

## ⚖️ License

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
