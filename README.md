# Vixely

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Symfony 8](https://img.shields.io/badge/Symfony-8-000000?logo=symfony)
![WASM](https://img.shields.io/badge/Powered%20by-WebAssembly-654FF0?logo=webassembly)

**Vixely** is a modern, privacy-first web application designed to optimize, convert, and edit media files for the web.

Unlike traditional online converters that require uploading files to a remote server, **Vixely processes everything directly in your browser** using WebAssembly. This ensures maximum privacy, zero wait times for uploads, and unlimited file handling.

## ✨ Features

### 🎬 Video Tools
*   **Smart Compression:** Reduce video size without losing quality (H.264, H.265, AV1).
*   **Social Presets:** One-click optimization for **Discord Nitro** (<10MB), **Twitter/X Headers**, **YouTube Thumbnails**, and **TikTok**.
*   **Format Conversion:** Convert between MP4, WebM, MOV, and GIF.
*   **Trimming & Cropping:** Adjust your video dimensions and length instantly.

### 🖼️ Image & GIF Optimization
*   **Next-Gen Formats:** Convert standard images to **AVIF** and **WebP** for the web.
*   **GIF Crusher:** Optimize heavy GIFs to fit Discord/Slack limits (<256kb for emojis, <10MB for banners).
*   **Privacy-First:** Your photos and videos **never leave your device**.

## 🛠️ Technology Stack

Built with a focus on performance and modern web standards.

*   **Frontend:** React 19, TailwindCSS 4, TanStack Router, Bun.
*   **Backend:** Symfony 8, FrankenPHP.
*   **Core Engine:** WebAssembly (`ffmpeg.wasm` for video, `@jsquash` for images).
*   **Database:** PostgreSQL.

## 🚀 Getting Started

You can run the full stack locally using Docker.

### Prerequisites
*   Docker Desktop
*   Git

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/vixely.git
    cd vixely
    ```

2.  **Start the application**
    ```bash
    docker compose up -d
    ```

3.  **Access Vixely**
    *   Frontend: `http://localhost:5173`
    *   API: `http://localhost:8000`

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the project
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

*Made with ❤️ in France.*
