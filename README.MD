# Arduino CI

Небольшое desktop-приложение (Tauri + React) для работы с Arduino-проектами: выбрать плату и порт, запускать compile/upload, управлять библиотеками и смотреть serial monitor из одного окна.

## Как скомпилировать

### Требования
- Rust (stable) + Cargo
- Node.js + npm
- `arduino-cli` в `PATH`

### Debug
```powershell
npm --prefix frontend install
cargo build
```

### Release
```powershell
npm --prefix frontend install
cargo build --release
```

Готовый `.exe` после release-сборки: `target\release\arduino_ci.exe`.
