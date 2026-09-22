# Slot iOS

WKWebView-оболочка над мобильным клиентом `/mobile`. Готовый IPA в этой среде не собирается: нет Xcode и macOS. Исходники готовы к сборке на Mac.

## Что получится

- приложение `ru.slot.booking`
- открывает страницу `/mobile` на весь экран
- работает как обычное iOS-приложение, без Telegram

## Установка без App Store (PWA)

На iPhone / iPad это быстрее, чем IPA:

1. Откройте `/mobile` в Safari (не в Chrome).
2. Нажмите «Поделиться».
3. Выберите «На экран Домой».
4. Подтвердите «Добавить».

Иконка Slot появится на домашнем экране и откроется без панели Safari.

## Сборка IPA в Xcode

1. Установите Xcode на Mac.
2. Скопируйте папку `ios/` на компьютер.
3. В `Slot/Info.plist` замените `SLOT_APP_URL` на публичный https-адрес, например `https://your-domain.com/mobile`.
4. Откройте `Slot.xcodeproj` (File → Open → `ios` в Xcode, либо создайте проект и перенесите файлы):
   - New Project → App
   - Product Name: Slot
   - Organization Identifier: ru.slot
   - Interface: Storyboard
   - Language: Swift
5. Замените сгенерированные `AppDelegate.swift`, `SceneDelegate.swift`, `ViewController.swift` и `Info.plist` файлами из этой папки.
6. Добавьте иконку `Slot/Assets.xcassets/AppIcon.appiconset`.
7. Выберите симулятор iPhone и нажмите Run.

Для устройства:

```text
Signing & Capabilities → Team → ваш Apple ID
```

Архив для TestFlight / Ad Hoc: Product → Archive.

## Важно

- Safari не ставит PWA из Chrome / Telegram in-app browser — нужен именно Safari.
- `localhost` с iPhone недоступен — нужен публичный https URL.
- Публикация в App Store требует аккаунт Apple Developer (99 USD/год) и ревью.
