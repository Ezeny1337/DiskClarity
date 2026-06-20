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
  📑 <a href="#-overview">Overview</a> • <a href="#-features">Features</a> • <a href="#-installation">Installation</a> • <a href="#%EF%B8%8F-support">Support</a> • <a href="#%EF%B8%8F-license">License</a>
</p>

<p align="center">
  🌐 <a href="./README.md">English</a> | <a href="./README_zh.md">中文</a>
</p>

---

## 📖 Overview

**DiskClarity** is an open-source high-performance lightweight disk space analysis tool that uses MFT and modern UI to
provide extremely fast scanning speed and comprehensive storage analysis.

### 🚀 Features

**⚡ Extreme Performance**

- **NTFS MFT Direct Parsing**: Directly read the main file table (MFT) of NTFS for fast scanning
- **Rust-Powered Backend**: Memory-safe, zero-cost abstractions with maximum performance
- **Parallel Processing**: Multi-threaded scanning using Rayon library
- **Memory usage optimization**: Ultimate optimization of running memory usage, comparable to native experience.
- **Data transmission optimization**:Minimize the amount of data transmission between the front-end and back-end as much
  as possible

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

<img width="1920" height="1040" alt="ss1" src="https://github.com/user-attachments/assets/5fc12dbc-c54a-4c82-a9d9-9fae60f7cc8c" />
<img width="1920" height="1040" alt="ss2" src="https://github.com/user-attachments/assets/3c18b9d3-a07d-4870-9485-0625f689ec55" />
<img width="1920" height="1040" alt="ss3" src="https://github.com/user-attachments/assets/b9779a48-f836-4368-b9cd-e23da8f3bf69" />


## 🧰 Installation

### Prerequisites

- **Windows 10/11** (NTFS file system required for MFT parsing and needs to be run by an administrator)

### Pre-built Releases

Download the latest release from [GitHub Releases](https://github.com/Ezeny1337/DiskClarity/releases):

- Portable versions available
- `diskclarity-setup.exe` - Windows installer
- `diskClarity.msi` - Alternative Windows installer

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
